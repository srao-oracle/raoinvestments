-- M1 · Functions, triggers, views, RPCs. Created after all tables exist.

-- ── ownership helper (basis of RLS; SECURITY DEFINER avoids policy recursion) ──
create or replace function auth_owns_portfolio(p_portfolio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from portfolios where id = p_portfolio and owner_id = auth.uid());
$$;

-- ── optimistic-lock version bump ──
create or replace function fn_bump_version() returns trigger
language plpgsql as $$
begin
  new.version := old.version + 1;
  if to_jsonb(new) ? 'updated_at' then new.updated_at := now(); end if;
  return new;
end $$;

create trigger trg_portfolios_version   before update on portfolios        for each row execute function fn_bump_version();
create trigger trg_opportunities_version before update on opportunities     for each row execute function fn_bump_version();
create trigger trg_threads_version       before update on agent_threads     for each row execute function fn_bump_version();
create trigger trg_fund_version          before update on fund_transactions for each row execute function fn_bump_version();

-- ── append-only guard (record of decisions) ──
create or replace function fn_reject_mutation() returns trigger
language plpgsql as $$
begin
  raise exception '% is append-only; % is not allowed', tg_table_name, tg_op;
end $$;

create trigger trg_trades_no_mutate    before update or delete on trades             for each row execute function fn_reject_mutation();
create trigger trg_oppevents_no_mutate before update or delete on opportunity_events for each row execute function fn_reject_mutation();

-- ── trades → positions (avg cost, realized P&L) + cash; long-only + collateral guards ──
create or replace function fn_trades_apply() returns trigger
language plpgsql set search_path = public as $$
declare
  v_dir            position_direction;
  v_pos            positions%rowtype;
  v_gross          numeric(20, 4);
  v_cash_delta     numeric(20, 4);
  v_realized       numeric(20, 4) := 0;
  v_new_qty        numeric(20, 4);
  v_pf_cash        numeric(20, 4);
  v_underlying     uuid;
  v_opt_type       option_type;
  v_shares         numeric(20, 4);
  v_short_calls    numeric(20, 4);
  v_put_collateral numeric(20, 4);
begin
  select cash_balance into v_pf_cash from portfolios where id = new.portfolio_id for update;

  v_gross := round(new.quantity * new.price * new.multiplier, 4);
  v_dir := case new.action
    when 'buy_to_open'  then 'long'
    when 'sell_to_close' then 'long'
    when 'sell_to_open' then 'short'
    when 'buy_to_close' then 'short' end;

  v_cash_delta := case
    when new.action in ('buy_to_open', 'buy_to_close') then -(v_gross + new.fees)
    else (v_gross - new.fees) end;

  select * into v_pos from positions
   where portfolio_id = new.portfolio_id
     and instrument_id = new.instrument_id
     and contract_id is not distinct from new.contract_id
     and status = 'open'
   for update;

  if new.action in ('buy_to_open', 'sell_to_open') then
    if new.action = 'sell_to_open' then
      if new.asset_class <> 'option' then
        raise exception 'short selling of % is not allowed (long-only)', new.asset_class;
      end if;
      select underlying_instrument_id, option_type into v_underlying, v_opt_type
        from option_contracts where instrument_id = new.contract_id;
      if v_opt_type = 'call' then
        select coalesce(quantity, 0) into v_shares from positions
          where portfolio_id = new.portfolio_id and instrument_id = v_underlying
            and contract_id is null and direction = 'long' and status = 'open';
        select coalesce(sum(p.quantity), 0) into v_short_calls from positions p
          join option_contracts oc on oc.instrument_id = p.contract_id
          where p.portfolio_id = new.portfolio_id and oc.underlying_instrument_id = v_underlying
            and oc.option_type = 'call' and p.direction = 'short' and p.status = 'open';
        if (coalesce(v_short_calls, 0) + new.quantity) * 100 > coalesce(v_shares, 0) then
          raise exception 'covered-call guard: need % shares to cover, have %',
            (coalesce(v_short_calls, 0) + new.quantity) * 100, coalesce(v_shares, 0);
        end if;
      else
        select coalesce(sum(oc.strike * 100 * p.quantity), 0) into v_put_collateral from positions p
          join option_contracts oc on oc.instrument_id = p.contract_id
          where p.portfolio_id = new.portfolio_id and oc.underlying_instrument_id = v_underlying
            and oc.option_type = 'put' and p.direction = 'short' and p.status = 'open';
        v_put_collateral := coalesce(v_put_collateral, 0)
          + (select strike * 100 * new.quantity from option_contracts where instrument_id = new.contract_id);
        if (coalesce(v_pf_cash, 0) + v_cash_delta) < v_put_collateral then
          raise exception 'cash-secured-put guard: collateral % exceeds available cash %',
            v_put_collateral, coalesce(v_pf_cash, 0) + v_cash_delta;
        end if;
      end if;
    end if;

    if v_pos.id is null then
      insert into positions (portfolio_id, asset_class, instrument_id, contract_id, direction, quantity, avg_cost, multiplier, opened_at)
        values (new.portfolio_id, new.asset_class, new.instrument_id, new.contract_id, v_dir, new.quantity, new.price, new.multiplier, new.executed_at);
    else
      if v_pos.direction <> v_dir then
        raise exception 'long-only: cannot open opposite direction on existing % position', v_pos.direction;
      end if;
      v_new_qty := v_pos.quantity + new.quantity;
      update positions
        set avg_cost = round((v_pos.quantity * v_pos.avg_cost + new.quantity * new.price) / v_new_qty, 6),
            quantity = v_new_qty
       where id = v_pos.id;
    end if;

  else -- sell_to_close / buy_to_close
    if v_pos.id is null or v_pos.direction <> v_dir then
      raise exception 'no open % position to close for instrument %', v_dir, new.instrument_id;
    end if;
    if new.quantity > v_pos.quantity then
      raise exception 'close quantity % exceeds open quantity %', new.quantity, v_pos.quantity;
    end if;
    v_realized := case
      when v_dir = 'long' then round((new.price - v_pos.avg_cost) * new.quantity * new.multiplier - new.fees, 4)
      else round((v_pos.avg_cost - new.price) * new.quantity * new.multiplier - new.fees, 4) end;
    new.realized_pnl := v_realized;
    v_new_qty := v_pos.quantity - new.quantity;
    if v_new_qty = 0 then
      update positions set quantity = 0, status = 'closed', closed_at = new.executed_at,
        realized_pnl = realized_pnl + v_realized where id = v_pos.id;
    else
      update positions set quantity = v_new_qty, realized_pnl = realized_pnl + v_realized where id = v_pos.id;
    end if;
  end if;

  update portfolios set cash_balance = round(cash_balance + v_cash_delta, 4) where id = new.portfolio_id;
  return new;
end $$;

create trigger trg_trades_apply before insert on trades
  for each row execute function fn_trades_apply();

-- ── fund_transactions → cash (on completed; liquidation_request never moves cash directly) ──
create or replace function fn_fund_apply() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.txn_type = 'liquidation_request' then return null; end if;
  if tg_op = 'INSERT' then
    if new.status = 'completed' then
      update portfolios set cash_balance = round(cash_balance + new.amount, 4) where id = new.portfolio_id;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.status <> 'completed' and new.status = 'completed' then
      update portfolios set cash_balance = round(cash_balance + new.amount, 4) where id = new.portfolio_id;
    elsif old.status = 'completed' and new.status <> 'completed' then
      update portfolios set cash_balance = round(cash_balance - old.amount, 4) where id = old.portfolio_id;
    elsif old.status = 'completed' and new.status = 'completed' and old.amount <> new.amount then
      update portfolios set cash_balance = round(cash_balance - old.amount + new.amount, 4) where id = new.portfolio_id;
    end if;
  end if;
  return null;
end $$;

create trigger trg_fund_apply after insert or update on fund_transactions
  for each row execute function fn_fund_apply();

-- ── opportunity state machine + append-only audit ──
create or replace function fn_opportunity_transition() returns trigger
language plpgsql set search_path = public as $$
declare v_ok boolean;
begin
  if new.status = old.status then return new; end if;
  v_ok := case old.status
    when 'candidate'           then new.status in ('under_investigation', 'rejected')
    when 'under_investigation' then new.status in ('proposed', 'candidate', 'rejected')
    when 'proposed'            then new.status in ('invested', 'under_investigation', 'rejected')
    when 'invested'            then new.status in ('closed')
    else false end;
  if not v_ok then
    raise exception 'illegal opportunity transition % -> %', old.status, new.status;
  end if;
  new.state_changed_at := now();
  insert into opportunity_events (opportunity_id, from_status, to_status, actor)
    values (new.id, old.status, new.status, coalesce(auth.uid()::text, 'system'));
  return new;
end $$;

create trigger trg_opportunity_transition before update of status on opportunities
  for each row execute function fn_opportunity_transition();

create or replace function fn_opportunity_seed_event() returns trigger
language plpgsql set search_path = public as $$
begin
  insert into opportunity_events (opportunity_id, from_status, to_status, actor)
    values (new.id, null, new.status, coalesce(auth.uid()::text, 'system'));
  return new;
end $$;

create trigger trg_opportunity_seed after insert on opportunities
  for each row execute function fn_opportunity_seed_event();

-- ── strategy version flip (atomic) ──
create or replace function set_current_strategy(
  p_portfolio uuid, p_doc jsonb, p_summary text default null,
  p_change_reason text default null, p_changed_by text default 'user'
) returns strategies language plpgsql security invoker set search_path = public as $$
declare v_next int; v_prev uuid; v_row strategies;
begin
  select coalesce(max(version), 0) + 1 into v_next from strategies where portfolio_id = p_portfolio;
  select id into v_prev from strategies where portfolio_id = p_portfolio and is_current;
  update strategies set is_current = false where portfolio_id = p_portfolio and is_current;
  insert into strategies (portfolio_id, version, doc, summary, is_current, changed_by, change_reason, supersedes_id)
    values (p_portfolio, v_next, p_doc, p_summary, true, p_changed_by, p_change_reason, v_prev)
  returning * into v_row;
  return v_row;
end $$;

-- ── live P&L view (RLS-respecting) ──
create view position_pnl with (security_invoker = on) as
select p.*, q.last_price, q.mid,
  round(p.quantity * coalesce(q.last_price, q.mid, 0) * p.multiplier, 4) as market_value,
  case when p.direction = 'long'
    then round((coalesce(q.last_price, q.mid, 0) - p.avg_cost) * p.quantity * p.multiplier, 4)
    else round((p.avg_cost - coalesce(q.last_price, q.mid, 0)) * p.quantity * p.multiplier, 4)
  end as unrealized_pnl
from positions p
left join market_quotes q
  on (p.contract_id is not null and q.contract_id = p.contract_id)
   or (p.contract_id is null and q.instrument_id = p.instrument_id and q.contract_id is null)
where p.status = 'open';

-- ── NAV snapshot (job) ──
create or replace function fn_snapshot_nav(p_portfolio uuid, p_as_of date default current_date)
returns portfolio_snapshots language plpgsql security definer set search_path = public as $$
declare v_cash numeric(20,4); v_mv numeric(20,4); v_upnl numeric(20,4);
  v_rpnl numeric(20,4); v_dep numeric(20,4); v_row portfolio_snapshots;
begin
  select cash_balance into v_cash from portfolios where id = p_portfolio;
  select coalesce(sum(market_value), 0), coalesce(sum(unrealized_pnl), 0) into v_mv, v_upnl
    from position_pnl where portfolio_id = p_portfolio;
  select coalesce(sum(realized_pnl), 0) into v_rpnl from trades where portfolio_id = p_portfolio;
  select coalesce(sum(amount), 0) into v_dep from fund_transactions
    where portfolio_id = p_portfolio and status = 'completed' and txn_type in ('deposit', 'withdrawal');
  insert into portfolio_snapshots (portfolio_id, as_of, nav, cash, positions_value, unrealized_pnl, realized_pnl_cumulative, net_deposits)
    values (p_portfolio, p_as_of, round(coalesce(v_cash, 0) + v_mv, 4), coalesce(v_cash, 0), v_mv, v_upnl, v_rpnl, v_dep)
  on conflict (portfolio_id, as_of) do update
    set nav = excluded.nav, cash = excluded.cash, positions_value = excluded.positions_value,
        unrealized_pnl = excluded.unrealized_pnl, realized_pnl_cumulative = excluded.realized_pnl_cumulative,
        net_deposits = excluded.net_deposits
  returning * into v_row;
  return v_row;
end $$;

-- ── pgvector memory retrieval (RLS-respecting) ──
create or replace function match_memory(p_portfolio uuid, query_embedding vector(1024), k int default 8)
returns table (id uuid, kind memory_kind, content text, metadata jsonb, similarity float)
language sql stable security invoker set search_path = public as $$
  select m.id, m.kind, m.content, m.metadata, 1 - (m.embedding <=> query_embedding) as similarity
  from agent_memory m
  where m.portfolio_id = p_portfolio and m.embedding is not null
  order by m.embedding <=> query_embedding
  limit greatest(k, 1);
$$;

-- ── IV rank helper ──
create or replace function fn_iv_rank(p_instrument uuid, p_lookback int default 252)
returns numeric language sql stable set search_path = public as $$
  with w as (
    select atm_iv from iv_history where instrument_id = p_instrument and as_of > current_date - p_lookback
  ), cur as (
    select atm_iv from iv_history where instrument_id = p_instrument order by as_of desc limit 1
  )
  select case
    when (select max(atm_iv) from w) = (select min(atm_iv) from w) then null
    else round(100 * (((select atm_iv from cur) - (select min(atm_iv) from w))
      / nullif((select max(atm_iv) from w) - (select min(atm_iv) from w), 0)), 3)
  end;
$$;

-- ── allowlist auth hook (optional; enable in Supabase Auth → Hooks → Before user created) ──
create or replace function auth_before_user_created(event jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  v_email := lower(coalesce(event -> 'claims' ->> 'email', event -> 'user_metadata' ->> 'email', event ->> 'email'));
  if v_email is null or not exists (select 1 from app_allowlist where email = v_email and is_active) then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'Email not on allowlist'));
  end if;
  return event;
end $$;
