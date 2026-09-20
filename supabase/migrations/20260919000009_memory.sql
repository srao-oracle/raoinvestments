-- M1 · Long-term agent memory (pgvector). Embedding dim 1024 (Voyage voyage-3-large).

create table agent_memory (
  id            uuid primary key default gen_random_uuid(),
  portfolio_id  uuid references portfolios (id) on delete cascade,
  opportunity_id uuid references opportunities (id) on delete set null,
  scope         text not null default 'portfolio' check (scope in ('global', 'portfolio', 'opportunity')),
  kind          memory_kind not null default 'observation',
  content       text not null,
  embedding     vector(1024),
  metadata      jsonb not null default '{}'::jsonb,
  source_run_id uuid references agent_runs (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index agent_memory_embedding_hnsw
  on agent_memory using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);
create index on agent_memory (portfolio_id, kind);
