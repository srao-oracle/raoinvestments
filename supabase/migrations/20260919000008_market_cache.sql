-- M1 · Market-data cache + analytics snapshots (populated by M2 worker/jobs).

create table market_quotes (
  id          uuid primary key default gen_random_uuid(),
  instrument_id uuid references instruments (id) on delete cascade,
  contract_id uuid references option_contracts (instrument_id) on delete cascade,
  last_price  numeric(20, 6),
  bid         numeric(20, 6),
  ask         numeric(20, 6),
  mid         numeric(20, 6) generated always as ((coalesce(bid, 0) + coalesce(ask, 0)) / 2) stored,
  bid_size    numeric(20, 4),
  ask_size    numeric(20, 4),
  day_open    numeric(20, 6),
  day_high    numeric(20, 6),
  day_low     numeric(20, 6),
  prev_close  numeric(20, 6),
  volume      numeric(20, 4),
  as_of       timestamptz not null default now(),
  source      text,
  constraint quote_target_chk check ((instrument_id is not null) <> (contract_id is not null))
);
create unique index market_quotes_one_stock on market_quotes (instrument_id) where contract_id is null;
create unique index market_quotes_one_option on market_quotes (contract_id) where contract_id is not null;

create table ohlc_bars (
  instrument_id uuid not null references instruments (id) on delete cascade,
  timeframe     text not null,
  ts            timestamptz not null,
  open          numeric(20, 6) not null,
  high          numeric(20, 6) not null,
  low           numeric(20, 6) not null,
  close         numeric(20, 6) not null,
  volume        numeric(20, 4) not null default 0,
  vwap          numeric(20, 6),
  primary key (instrument_id, timeframe, ts)
) partition by range (ts);
create table ohlc_bars_default partition of ohlc_bars default;

create table greeks_snapshots (
  id               uuid primary key default gen_random_uuid(),
  contract_id      uuid not null references option_contracts (instrument_id) on delete cascade,
  as_of            timestamptz not null default now(),
  iv               numeric(12, 6),
  delta            numeric(12, 6),
  gamma            numeric(12, 6),
  theta            numeric(12, 6),
  vega             numeric(12, 6),
  rho              numeric(12, 6),
  open_interest    bigint,
  underlying_price numeric(20, 6),
  unique (contract_id, as_of)
);
create index on greeks_snapshots (contract_id, as_of desc);

create table iv_history (
  instrument_id uuid not null references instruments (id) on delete cascade,
  as_of         date not null,
  atm_iv        numeric(12, 6) not null,
  dte_used      int,
  iv_rank       numeric(6, 3),
  spot_price    numeric(20, 6),
  primary key (instrument_id, as_of)
);

create table breadth_snapshots (
  as_of            date primary key,
  advancers        int,
  decliners        int,
  pct_above_50dma  numeric(6, 3),
  pct_above_200dma numeric(6, 3),
  new_highs        int,
  new_lows         int,
  metadata         jsonb not null default '{}'::jsonb
);

create table macro_series (
  series_id  text not null,
  as_of      date not null,
  value      numeric(20, 6),
  fetched_at timestamptz not null default now(),
  primary key (series_id, as_of)
);

create table portfolio_snapshots (
  portfolio_id            uuid not null references portfolios (id) on delete cascade,
  as_of                   date not null,
  nav                     numeric(20, 4) not null,
  cash                    numeric(20, 4) not null,
  positions_value         numeric(20, 4) not null default 0,
  unrealized_pnl          numeric(20, 4) not null default 0,
  realized_pnl_cumulative numeric(20, 4) not null default 0,
  net_deposits            numeric(20, 4) not null default 0,
  primary key (portfolio_id, as_of)
);

create table feed_health (
  feed_name       text primary key,
  status          text not null default 'unknown',
  connected       boolean not null default false,
  last_success_at timestamptz,
  last_error_at   timestamptz,
  last_error      text,
  latency_ms      int,
  updated_at      timestamptz not null default now()
);
