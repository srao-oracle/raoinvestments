-- Enable hedging: permit short opens (short stock/ETF, naked/short options, put spreads)
-- so the book can be hedged. Risk is now managed at the agent/strategy layer, not hard-blocked
-- in the ledger. Cash, average cost, and realized-P&L mechanics already handle short positions
-- (a short opens direction='short' and closes via buy_to_close). Structural guards remain:
-- append-only trades, no long/short flip on the same instrument, and no oversell on close.
create or replace function fn_trades_apply() returns trigger
language plpgsql set search_path = public as $$
declare
  v_dir        position_direction;
  v_pos        positions%rowtype;
  v_gross      numeric(20, 4);
  v_cash_delta numeric(20, 4);
  v_realized   numeric(20, 4) := 0;
  v_new_qty    numeric(20, 4);
  v_pf_cash    numeric(20, 4);
begin
  select cash_balance into v_pf_cash from portfolios where id = new.portfolio_id for update;

  v_gross := round(new.quantity * new.price * new.multiplier, 4);
  v_dir := case new.action
    when 'buy_to_open'   then 'long'
    when 'sell_to_close' then 'long'
    when 'sell_to_open'  then 'short'
    when 'buy_to_close'  then 'short' end;

  -- Short opens receive cash (proceeds); long opens pay cash. Fees always reduce cash.
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
    -- Hedging enabled: both long and short opens are allowed (no long-only / collateral block).
    if v_pos.id is null then
      insert into positions (portfolio_id, asset_class, instrument_id, contract_id, direction, quantity, avg_cost, multiplier, opened_at)
        values (new.portfolio_id, new.asset_class, new.instrument_id, new.contract_id, v_dir, new.quantity, new.price, new.multiplier, new.executed_at);
    else
      if v_pos.direction <> v_dir then
        raise exception 'cannot open opposite direction on existing % position (close it first)', v_pos.direction;
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

-- Allow a 'hedge' agent job kind.
alter table public.agent_jobs drop constraint if exists agent_jobs_kind_check;
alter table public.agent_jobs add constraint agent_jobs_kind_check
  check (kind in ('pipeline', 'scout', 'strategist', 'hedge'));
