-- M1 · Instruments (stocks/etfs/indices/options) + option contract detail.

create table instruments (
  id                       uuid primary key default gen_random_uuid(),
  symbol                   text not null,
  name                     text,
  asset_class              asset_class not null default 'stock',
  underlying_instrument_id uuid references instruments (id),
  exchange                 text,
  currency                 char(3) not null default 'USD',
  sector                   text,
  polygon_ticker           text,
  figi                     text,
  active                   boolean not null default true,
  metadata                 jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  unique (symbol, currency)
);

create table option_contracts (
  instrument_id            uuid primary key references instruments (id) on delete cascade,
  underlying_instrument_id uuid not null references instruments (id),
  occ_symbol               text not null unique,
  option_type              option_type not null,
  strike                   numeric(20, 6) not null check (strike > 0),
  expiration_date          date not null,
  contract_multiplier      int not null default 100 check (contract_multiplier > 0),
  exercise_style           text not null default 'american' check (exercise_style in ('american', 'european')),
  created_at               timestamptz not null default now(),
  unique (underlying_instrument_id, option_type, strike, expiration_date)
);
create index on option_contracts (underlying_instrument_id, expiration_date);
