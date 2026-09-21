-- Background agent jobs. The web app enqueues (service role); the always-on Fly
-- worker claims and runs them (no function-timeout limit, unlike Vercel). Owners
-- can read their portfolio's jobs for status display.
create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  kind text not null check (kind in ('pipeline', 'scout', 'strategist')),
  params jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'error')),
  result jsonb,
  error text,
  attempts int not null default 0,
  requested_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists agent_jobs_status_idx on public.agent_jobs (status, created_at);
create index if not exists agent_jobs_portfolio_idx on public.agent_jobs (portfolio_id, created_at desc);

alter table public.agent_jobs enable row level security;

-- Owners read their own jobs. Inserts/updates flow through the service role
-- (web enqueue + worker processing), which bypasses RLS.
drop policy if exists agent_jobs_select on public.agent_jobs;
create policy agent_jobs_select on public.agent_jobs
  for select to authenticated
  using (auth_owns_portfolio(portfolio_id));
