-- Ravenstack Keep command-layer tables (per-operator drafts and sessions)

create table if not exists forge_drafts (
  id serial primary key,
  user_id text not null,
  idea text not null,
  interrogation text,
  spec_json text not null,
  status text not null default 'draft',
  created_at timestamptz not null default now()
);
create index if not exists forge_drafts_user_id_idx on forge_drafts (user_id);

create table if not exists table_sessions (
  id serial primary key,
  user_id text not null,
  question text not null,
  result_json text not null,
  created_at timestamptz not null default now()
);
create index if not exists table_sessions_user_id_idx on table_sessions (user_id);

create table if not exists oracle_queries (
  id serial primary key,
  user_id text not null,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);
create index if not exists oracle_queries_user_id_idx on oracle_queries (user_id);

create table if not exists inspections (
  id serial primary key,
  user_id text not null,
  kind text not null,
  concern text not null,
  result text not null,
  created_at timestamptz not null default now()
);
create index if not exists inspections_user_id_idx on inspections (user_id);
