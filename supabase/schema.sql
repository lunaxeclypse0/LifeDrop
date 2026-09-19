-- LifeDrop database schema.
--
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- It is safe to run again; every statement is idempotent.
--
-- The whole point of this file is the row-level security at the bottom. Without
-- it, the anon key in the browser bundle can read every row in the table — and
-- these rows are people's bills, passports and addresses.

-- ---------------------------------------------------------------------------
-- drops
-- ---------------------------------------------------------------------------

create table if not exists public.drops (
  id                 text primary key,
  user_id            uuid not null references auth.users (id) on delete cascade,

  title              text not null default '',
  merchant           text not null default '',
  amount             numeric,
  category           text not null default 'document',
  date               date not null,
  time               text,
  status             text not null default 'saved',
  repeat             text not null default 'none',
  remind_days_before integer,
  reference          text not null default '',
  notes              text not null default '',
  file_name          text not null default '',
  image_path         text,
  needs_review       boolean not null default false,
  archived           boolean not null default false,
  history            jsonb not null default '[]'::jsonb,

  created_at         timestamptz not null default now(),
  -- The sync layer compares this to decide which side is newer, so it must be
  -- set by the client, not defaulted on write.
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz
);

-- Sync pulls "everything of mine changed since X", so this is the index that matters.
create index if not exists drops_user_updated_idx
  on public.drops (user_id, updated_at desc);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '',
  preferences jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- A profile row should exist the moment someone signs up, not the first time
-- they happen to save a setting.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- row-level security
-- ---------------------------------------------------------------------------
--
-- The browser holds the anon key, which is public by design. RLS is the only
-- thing standing between one user's vault and everybody else's, so it is
-- enabled here and every policy is scoped to auth.uid().

alter table public.drops    enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "drops are private to their owner"    on public.drops;
drop policy if exists "drops are inserted by their owner"   on public.drops;
drop policy if exists "drops are updated by their owner"    on public.drops;
drop policy if exists "drops are deleted by their owner"    on public.drops;

create policy "drops are private to their owner"
  on public.drops for select using (auth.uid() = user_id);

-- `with check` on insert stops a client writing a row under someone else's id.
create policy "drops are inserted by their owner"
  on public.drops for insert with check (auth.uid() = user_id);

create policy "drops are updated by their owner"
  on public.drops for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "drops are deleted by their owner"
  on public.drops for delete using (auth.uid() = user_id);

drop policy if exists "profiles are private to their owner"  on public.profiles;
drop policy if exists "profiles are inserted by their owner" on public.profiles;
drop policy if exists "profiles are updated by their owner"  on public.profiles;

create policy "profiles are private to their owner"
  on public.profiles for select using (auth.uid() = id);

create policy "profiles are inserted by their owner"
  on public.profiles for insert with check (auth.uid() = id);

create policy "profiles are updated by their owner"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- storage for original images
-- ---------------------------------------------------------------------------
--
-- Private bucket. Every object lives under <user-id>/..., and the policies
-- below check that the first path segment is the caller's own id.

insert into storage.buckets (id, name, public)
values ('drops', 'drops', false)
on conflict (id) do nothing;

drop policy if exists "drop images are read by their owner"    on storage.objects;
drop policy if exists "drop images are written by their owner" on storage.objects;
drop policy if exists "drop images are deleted by their owner" on storage.objects;

create policy "drop images are read by their owner"
  on storage.objects for select
  using (bucket_id = 'drops' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "drop images are written by their owner"
  on storage.objects for insert
  with check (bucket_id = 'drops' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "drop images are deleted by their owner"
  on storage.objects for delete
  using (bucket_id = 'drops' and (storage.foldername(name))[1] = auth.uid()::text);
