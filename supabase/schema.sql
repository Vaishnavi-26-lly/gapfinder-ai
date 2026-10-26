create extension if not exists vector;

create table users (id uuid primary key default gen_random_uuid(), email text unique not null, name text,
  password_hash text not null, created_at timestamptz default now());
create table documents (id uuid primary key default gen_random_uuid(), user_id uuid not null references users on delete cascade,
  title text not null, kind text not null check (kind in ('syllabus','notes','textbook','past_paper')), created_at timestamptz default now());
create table chunks (id uuid primary key default gen_random_uuid(), document_id uuid not null references documents on delete cascade,
  user_id uuid not null references users on delete cascade, position int not null, section text not null, content text not null,
  embedding vector(768));
create index on chunks using hnsw (embedding vector_cosine_ops);
create table topics (id uuid primary key default gen_random_uuid(), user_id uuid not null references users on delete cascade,
  name text not null, description text, position int not null);
create table attempts (id uuid primary key default gen_random_uuid(), user_id uuid not null references users on delete cascade,
  status text not null default 'open', score numeric, created_at timestamptz default now());
create table questions (id uuid primary key default gen_random_uuid(), attempt_id uuid not null references attempts on delete cascade,
  topic_id uuid not null references topics on delete cascade, question text not null, options jsonb not null, correct_index int not null,
  explanation text, source_chunk_id uuid references chunks on delete set null, citation text);
create table answers (question_id uuid primary key references questions on delete cascade, selected_index int, is_correct boolean, feedback text);
create table topic_scores (id uuid primary key default gen_random_uuid(), attempt_id uuid not null references attempts on delete cascade,
  user_id uuid not null references users on delete cascade, topic_id uuid not null references topics on delete cascade,
  correct int not null, total int not null, rating text not null, reason text, sources jsonb not null default '[]');
create table plans (id uuid primary key default gen_random_uuid(), user_id uuid not null references users on delete cascade,
  attempt_id uuid references attempts on delete cascade, days int not null, hours_per_day numeric not null, items jsonb not null,
  created_at timestamptz default now());

create or replace function match_chunks(query_embedding vector(768), match_user uuid, match_count int, kinds text[] default null)
returns table (id uuid, section text, content text, doc_title text, similarity float)
language sql stable as $$
  select c.id, c.section, c.content, d.title, 1 - (c.embedding <=> query_embedding)
  from chunks c join documents d on d.id = c.document_id
  where c.user_id = match_user and (kinds is null or d.kind = any(kinds))
  order by c.embedding <=> query_embedding limit match_count
$$;
