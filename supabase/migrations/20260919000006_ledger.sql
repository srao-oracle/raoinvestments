-- M1 · Ledger (source of truth): manual trade fills + materialized positions.
-- Long-only + collateral is enforced by the fn_trades_apply trigger in 0010.

create table trades (
  id             uuid primary key default gen_random_uuid(),
  portfolio_id   uuid not null references portfolios (id) on delete cascade,
  asset_class    asset_class not null,
  instrument_id  uuid not null references instruments (id),
  contract_id    uuid references option_contracts (instrument_id),
  action         trade_action not null,
  quantity       numeric(20, 4) not null check (quantity > 0),
  price          numeric(20, 6) not null check (price >= 0),
  fees           numeric(20, 4) not null default 0 check (fees >= 0),
  multiplier     int not null default 1 check (multiplier > 0),
  realized_pnl   numeric(20, 4) not null default 0,
  opportunity_id uuid references opportunities (id),
  trade_group_id uuid, -- reserved for future multi-leg option combos
  external_ref   text,
  executed_at    timestamptz not null default now(),
  created_by     uuid references profiles (id),
  notes          text,
  created_at     timestamptz not null default now(),
  constraint trades_option_shape check ((asset_class = 'option') = (contract_id is not null)),
  constraint trades_option_mult check (asset_class <> 'option' or multiplier = 100),
  constraint trades_stock_mult check (asset_class = 'option' or multiplier = 1)
);
create index on trades (portfolio_id, executed_at desc);
create index on trades (portfolio_id, instrument_id);
create index on trades (opportunity_id);

create table positions (
  id            uuid primary key default gen_random_uuid(),
  portfolio_id  uuid not null references portfolios (id) on delete cascade,
  asset_class   asset_class not null,
  instrument_id uuid not null references instruments (id),
  contract_id   uuid references option_contracts (instrument_id),
  direction     position_direction not null,
  quantity      numeric(20, 4) not null default 0 check (quantity >= 0),
  avg_cost      numeric(20, 6) not null default 0,
  multiplier    int not null default 1,
  realized_pnl  numeric(20, 4) not null default 0,
  status        position_status not null default 'open',
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  version       int not null default 1,
  constraint positions_option_shape check ((asset_class = 'option') = (contract_id is not null)),
  constraint positions_open_qty check (status <> 'open' or quantity > 0),
  constraint positions_closed_qty check (status <> 'closed' or quantity = 0)
);
create unique index positions_one_open
  on positions (portfolio_id, instrument_id, contract_id)
  nulls not distinct
  where (status = 'open');
create index on positions (portfolio_id, status);
