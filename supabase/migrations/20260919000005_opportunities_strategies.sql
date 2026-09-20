-- M1 · Opportunity pipeline (state machine) + versioned strategy docs.
-- Created before the ledger so trades can reference opportunities.

create table opportunities (
  id                uuid primary key default gen_random_uuid(),
  portfolio_id      uuid not null references portfolios (id) on delete cascade,
  instrument_id     uuid references instruments (id),
  contract_id       uuid references option_contracts (instrument_id),
  status            opportunity_status not null default 'candidate',
  direction         opportunity_direction,
  title             text,
  thesis            text,
  theme_id          text,
  conviction        numeric(4, 2) check (conviction between 0 and 1),
  proposed_quantity numeric(20, 4),
  proposed_notional numeric(20, 4),
  max_risk          numeric(20, 4),
  position_size_pct numeric(9, 4),
  sizing_rationale  text,
  entry_target      numeric(20, 6),
  stop_loss         numeric(20, 6),
  take_profit       numeric(20, 6),
  source            text not null default 'scout' check (source in ('scout', 'manual')),
  strategy_version  text,
  origin_run_id     uuid, -- FK to agent_runs added in 0007 (agents migration)
  rejected_reason   text,
  state_changed_at  timestamptz not null default now(),
  version           int not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index on opportunities (portfolio_id, status);

create table opportunity_events (
  id             uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  from_status    opportunity_status,
  to_status      opportunity_status not null,
  event_type     text not null default 'transition',
  actor          text,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index on opportunity_events (opportunity_id, created_at);

create table strategies (
  id            uuid primary key default gen_random_uuid(),
  portfolio_id  uuid not null references portfolios (id) on delete cascade,
  version       int not null,
  doc           jsonb not null,
  summary       text,
  is_current    boolean not null default false,
  changed_by    text not null default 'user' check (changed_by in ('user', 'pm_agent', 'strategist')),
  change_reason text,
  supersedes_id uuid references strategies (id),
  created_at    timestamptz not null default now(),
  unique (portfolio_id, version)
);
create unique index strategies_one_current on strategies (portfolio_id) where is_current;
