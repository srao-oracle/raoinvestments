-- M1 · Agent layer: threads, runs, messages (full Anthropic content blocks), tool logs,
-- scout candidates. Also wires the deferred opportunities.origin_run_id FK.

create table agent_threads (
  id              uuid primary key default gen_random_uuid(),
  portfolio_id    uuid not null references portfolios (id) on delete cascade,
  scope           text not null default 'portfolio' check (scope in ('portfolio', 'opportunity')),
  opportunity_id  uuid references opportunities (id) on delete cascade,
  agent_role      agent_role not null default 'portfolio_manager',
  title           text,
  status          text not null default 'active',
  last_message_at timestamptz,
  version         int not null default 1,
  created_at      timestamptz not null default now(),
  constraint thread_scope_chk check (scope <> 'opportunity' or opportunity_id is not null)
);
create index on agent_threads (portfolio_id, scope);

create table agent_runs (
  id            uuid primary key default gen_random_uuid(),
  thread_id     uuid references agent_threads (id) on delete set null,
  portfolio_id  uuid not null references portfolios (id) on delete cascade,
  agent_role    agent_role not null,
  trigger       text,
  status        run_status not null default 'queued',
  model         text,
  day_key       date not null default current_date,
  input_tokens  bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_usd      numeric(20, 6) not null default 0,
  usage         jsonb not null default '{}'::jsonb,
  input         jsonb not null default '{}'::jsonb,
  output        jsonb,
  error         text,
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index on agent_runs (portfolio_id, created_at desc);
create index on agent_runs (portfolio_id, day_key);

create table agent_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references agent_threads (id) on delete cascade,
  run_id      uuid references agent_runs (id) on delete set null,
  seq         bigint generated always as identity,
  role        message_role not null,
  content     jsonb not null, -- full Anthropic content-block array (thinking/tool_use/tool_result)
  model       text,
  stop_reason text,
  usage       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index on agent_messages (thread_id, seq);

create table tool_call_logs (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid not null references agent_runs (id) on delete cascade,
  message_id  uuid references agent_messages (id) on delete set null,
  tool_name   text not null,
  tool_use_id text,
  input       jsonb not null default '{}'::jsonb,
  output      jsonb,
  status      tool_call_status not null default 'ok',
  latency_ms  int,
  error       text,
  created_at  timestamptz not null default now()
);
create index on tool_call_logs (run_id, created_at);

create table scout_candidates (
  id                      uuid primary key default gen_random_uuid(),
  portfolio_id            uuid not null references portfolios (id) on delete cascade,
  run_id                  uuid references agent_runs (id) on delete set null,
  instrument_id           uuid references instruments (id),
  symbol                  text not null,
  theme_id                text,
  signal_type             text,
  score                   numeric(8, 3),
  raw                     jsonb not null default '{}'::jsonb,
  status                  scout_status not null default 'new',
  promoted_opportunity_id uuid references opportunities (id),
  scanned_at              timestamptz not null default now()
);
create index on scout_candidates (portfolio_id, status, score desc);

alter table opportunities
  add constraint opportunities_origin_run_fk
  foreign key (origin_run_id) references agent_runs (id) on delete set null;
