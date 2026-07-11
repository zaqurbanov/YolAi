-- Extensions
create extension if not exists vector;
create extension if not exists pgcrypto;

-- profiles: 1:1 extension of auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now()
);

-- documents: uploaded PDFs
create table documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  storage_path text not null,
  uploaded_by uuid references profiles(id),
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  page_count int,
  error_message text,
  created_at timestamptz not null default now()
);

-- chunks: text chunks + embeddings
create table chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  content text not null,
  page_number int,
  article_label text,
  chunk_index int not null,
  embedding vector(384) not null,
  created_at timestamptz not null default now()
);

create index chunks_embedding_idx on chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create index chunks_document_id_idx on chunks(document_id);

-- conversations & messages: chat history
create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  citations jsonb,
  created_at timestamptz not null default now()
);

create index messages_conversation_id_idx on messages(conversation_id);

-- ===== Monetization placeholders (schema only, not wired up in MVP) =====
create table subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  monthly_credit_limit int,
  price_cents int,
  created_at timestamptz not null default now()
);

create table user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  plan_id uuid references subscription_plans(id),
  status text not null default 'inactive' check (status in ('inactive', 'active', 'canceled')),
  credits_remaining int,
  period_start timestamptz,
  period_end timestamptz,
  created_at timestamptz not null default now()
);

-- match_chunks: pgvector similarity search RPC
create function match_chunks(query_embedding vector(384), match_count int default 6)
returns table (
  id uuid,
  content text,
  page_number int,
  article_label text,
  document_id uuid,
  document_title text,
  similarity float
)
language sql stable
as $$
  select
    c.id,
    c.content,
    c.page_number,
    c.article_label,
    d.id as document_id,
    d.title as document_title,
    1 - (c.embedding <=> query_embedding) as similarity
  from chunks c
  join documents d on d.id = c.document_id
  where d.status = 'ready'
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- auto-create profile row on signup
create function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- storage bucket for PDFs (private; access via signed URLs / service role only)
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
