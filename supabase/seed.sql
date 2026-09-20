-- Seed (dev + prod bootstrap). Idempotent. Portfolios/strategies are created per-user
-- after first login (a profile must exist first), so they are not seeded here.

insert into app_allowlist (email, note) values
  ('siddhartha.s.rao@gmail.com', 'owner (Sid)'),
  ('ljchurchward@gmail.com', 'owner (Lindsay)')
on conflict (email) do nothing;

insert into app_settings (key, value) values
  ('kill_switch', 'false'::jsonb)
on conflict (key) do nothing;

insert into instruments (symbol, name, asset_class, sector) values
  ('SPY',  'SPDR S&P 500 ETF Trust', 'etf',   'Index'),
  ('QQQ',  'Invesco QQQ Trust',      'etf',   'Index'),
  ('AAPL', 'Apple Inc.',             'stock', 'Technology'),
  ('MSFT', 'Microsoft Corp.',        'stock', 'Technology'),
  ('NVDA', 'NVIDIA Corp.',           'stock', 'Technology')
on conflict (symbol, currency) do nothing;
