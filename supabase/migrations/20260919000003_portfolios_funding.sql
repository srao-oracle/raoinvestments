-- M1 · Portfolios, target returns (versioned), fund transactions.

create table portfolios (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references profiles (id) on delete cascade,
  name           text not null,
  base_currency  char(3) not null default 'USD',
  cash_balance   numeric(20, 4) not null default 0, -- materialized by triggers (0010)
  inception_date date not null default current_date,
  risk_tolerance text not null default 'balanced'
    check (risk_tolerance in ('conservative_income', 'balanced', 'aggressive_momentum')),
  status         text not null default 'active' check (status in ('active', 'archived')),
  version        int not null default 1,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (owner_id, name)
);

create table portfolio_target_returns (
  id             uuid primary key default gen_random_uuid(),
  portfolio_id   uuid not null references portfolios (id) on delete cascade,
  period         text not null default 'annual' check (period in ('monthly', 'quarterly', 'annual')),
  target_pct     numeric(9, 4) not null,
  benchmark      text,
  effective_from date not null default current_date,
  set_by         text not null default 'user' check (set_by in ('user', 'agent')),
  created_at     timestamptz not null default now(),
  unique (portfolio_id, period, effective_from)
);

create table fund_transactions (
  id           uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references portfolios (id) on delete cascade,
  txn_type     fund_txn_type not null,
  status       fund_txn_status not null default 'completed',
  amount       numeric(20, 4) not null default 0, -- signed; deposits +, withdrawals/fees -
  currency     char(3) not null default 'USD',
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  external_ref text,
  notes        text,
  version      int not null default 1,
  created_at   timestamptz not null default now()
);
create index on fund_transactions (portfolio_id, requested_at desc);
