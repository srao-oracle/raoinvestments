-- Hedge structures: short the index (short_stock), short calls, and long puts (already present).
alter type opportunity_direction add value if not exists 'short_stock';
alter type opportunity_direction add value if not exists 'short_call';

-- Allow hedge-sourced opportunities.
alter table public.opportunities drop constraint if exists opportunities_source_check;
alter table public.opportunities add constraint opportunities_source_check
  check (source in ('scout', 'manual', 'hedge'));
