-- Run in the Supabase SQL editor (or via `supabase db push`). Safe to run more than once.
-- Each row belongs to the signed-in user. Row Level Security is switched on straight after each
-- table is created, and the policies only admit signed-in users reading their own rows, so the
-- public (anon/publishable) key on its own can't read or write anything.

create table if not exists public.transactions (
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  id          text not null,
  date        date not null,
  description text not null,
  amount      numeric(12, 2) not null,
  category    text,
  source      text,
  import_id   text not null,
  duplicate_of text,
  updated_at  timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.transactions enable row level security;
drop policy if exists "own transactions" on public.transactions;
create policy "own transactions" on public.transactions
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create index if not exists transactions_user_date on public.transactions (user_id, date);

create table if not exists public.rules (
  user_id  uuid not null default auth.uid() references auth.users on delete cascade,
  pattern  text not null,
  category text not null,
  primary key (user_id, pattern)
);
alter table public.rules enable row level security;
drop policy if exists "own rules" on public.rules;
create policy "own rules" on public.rules
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Added after the first version; safe to run on an existing database.
alter table public.transactions add column if not exists duplicate_of text;
