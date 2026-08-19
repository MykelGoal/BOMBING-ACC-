-- Run this once in Supabase: Dashboard → SQL Editor → New query → Run.
-- Every policy scopes data to the authenticated owner, so Gmail users never
-- see each other's customers or transaction history.
create table if not exists public.customers (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text default '',
  note text default '',
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.transactions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete cascade,
  person text not null,
  amount numeric not null check (amount > 0),
  type text not null check (type in ('debt', 'payment')),
  note text default '',
  created_at timestamptz not null default now()
);

alter table public.customers enable row level security;
alter table public.transactions enable row level security;

create policy "Users manage only their own customers" on public.customers
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users manage only their own transactions" on public.transactions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
