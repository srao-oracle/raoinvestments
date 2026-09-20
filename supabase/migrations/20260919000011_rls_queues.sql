-- M1 · Row Level Security + PostgREST grants + pgmq queues.
-- (pg_cron scheduling is wired in M7, once the Vercel cron/workflow endpoints exist.)

-- Let policies call the ownership helper.
grant execute on function auth_owns_portfolio(uuid) to authenticated;
grant execute on function set_current_strategy(uuid, jsonb, text, text, text) to authenticated;
grant execute on function match_memory(uuid, vector, int) to authenticated;
grant execute on function fn_iv_rank(uuid, int) to authenticated;
grant execute on function fn_snapshot_nav(uuid, date) to authenticated;

-- Enable RLS everywhere in public.
alter table profiles                 enable row level security;
alter table app_allowlist            enable row level security;
alter table app_settings             enable row level security;
alter table portfolios               enable row level security;
alter table portfolio_target_returns enable row level security;
alter table fund_transactions        enable row level security;
alter table instruments              enable row level security;
alter table option_contracts         enable row level security;
alter table opportunities            enable row level security;
alter table opportunity_events       enable row level security;
alter table strategies               enable row level security;
alter table trades                   enable row level security;
alter table positions                enable row level security;
alter table agent_threads            enable row level security;
alter table agent_runs               enable row level security;
alter table agent_messages           enable row level security;
alter table tool_call_logs           enable row level security;
alter table scout_candidates         enable row level security;
alter table market_quotes            enable row level security;
alter table ohlc_bars                enable row level security;
alter table greeks_snapshots         enable row level security;
alter table iv_history               enable row level security;
alter table breadth_snapshots        enable row level security;
alter table macro_series             enable row level security;
alter table portfolio_snapshots      enable row level security;
alter table feed_health              enable row level security;
alter table agent_memory             enable row level security;

-- Identity.
create policy profiles_self on profiles for select to authenticated using (id = auth.uid());
create policy profiles_self_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Portfolio (owner).
create policy portfolios_rw on portfolios for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Portfolio-scoped tables (identical pattern).
create policy ptr_rw   on portfolio_target_returns for all to authenticated using (auth_owns_portfolio(portfolio_id)) with check (auth_owns_portfolio(portfolio_id));
create policy fund_rw  on fund_transactions        for all to authenticated using (auth_owns_portfolio(portfolio_id)) with check (auth_owns_portfolio(portfolio_id));
create policy opp_rw   on opportunities            for all to authenticated using (auth_owns_portfolio(portfolio_id)) with check (auth_owns_portfolio(portfolio_id));
create policy strat_rw on strategies               for all to authenticated using (auth_owns_portfolio(portfolio_id)) with check (auth_owns_portfolio(portfolio_id));
create policy trades_rw on trades                  for all to authenticated using (auth_owns_portfolio(portfolio_id)) with check (auth_owns_portfolio(portfolio_id));
create policy pos_rw   on positions                for all to authenticated using (auth_owns_portfolio(portfolio_id)) with check (auth_owns_portfolio(portfolio_id));
create policy thread_rw on agent_threads           for all to authenticated using (auth_owns_portfolio(portfolio_id)) with check (auth_owns_portfolio(portfolio_id));
create policy run_rw   on agent_runs               for all to authenticated using (auth_owns_portfolio(portfolio_id)) with check (auth_owns_portfolio(portfolio_id));
create policy scout_rw on scout_candidates         for all to authenticated using (auth_owns_portfolio(portfolio_id)) with check (auth_owns_portfolio(portfolio_id));
create policy snap_rw  on portfolio_snapshots      for all to authenticated using (auth_owns_portfolio(portfolio_id)) with check (auth_owns_portfolio(portfolio_id));
create policy mem_rw   on agent_memory             for all to authenticated using (portfolio_id is null or auth_owns_portfolio(portfolio_id)) with check (portfolio_id is null or auth_owns_portfolio(portfolio_id));

-- Child tables (gate via parent).
create policy oppevents_rw on opportunity_events for all to authenticated
  using (exists (select 1 from opportunities o where o.id = opportunity_events.opportunity_id and auth_owns_portfolio(o.portfolio_id)))
  with check (exists (select 1 from opportunities o where o.id = opportunity_events.opportunity_id and auth_owns_portfolio(o.portfolio_id)));
create policy messages_rw on agent_messages for all to authenticated
  using (exists (select 1 from agent_threads t where t.id = agent_messages.thread_id and auth_owns_portfolio(t.portfolio_id)))
  with check (exists (select 1 from agent_threads t where t.id = agent_messages.thread_id and auth_owns_portfolio(t.portfolio_id)));
create policy toollogs_rw on tool_call_logs for all to authenticated
  using (exists (select 1 from agent_runs r where r.id = tool_call_logs.run_id and auth_owns_portfolio(r.portfolio_id)))
  with check (exists (select 1 from agent_runs r where r.id = tool_call_logs.run_id and auth_owns_portfolio(r.portfolio_id)));

-- Reference + market cache: read-any authenticated; writes are service-role only (bypasses RLS).
create policy ref_read_instruments on instruments        for select to authenticated using (true);
create policy ref_read_options     on option_contracts    for select to authenticated using (true);
create policy ref_read_quotes      on market_quotes       for select to authenticated using (true);
create policy ref_read_bars        on ohlc_bars           for select to authenticated using (true);
create policy ref_read_greeks      on greeks_snapshots    for select to authenticated using (true);
create policy ref_read_iv          on iv_history          for select to authenticated using (true);
create policy ref_read_breadth     on breadth_snapshots   for select to authenticated using (true);
create policy ref_read_macro       on macro_series        for select to authenticated using (true);
create policy ref_read_feed        on feed_health         for select to authenticated using (true);

-- app_allowlist / app_settings: no authenticated policies → default deny (service-role only).

-- pgmq queues (guarded).
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pgmq') then
    perform pgmq.create('scout_jobs');
    perform pgmq.create('analysis_jobs');
    perform pgmq.create('execution_jobs');
    perform pgmq.create('market_ingest');
    perform pgmq.create('embed_memory');
    perform pgmq.create('notifications');
  end if;
exception when others then raise notice 'pgmq queue setup skipped: %', sqlerrm;
end $$;
