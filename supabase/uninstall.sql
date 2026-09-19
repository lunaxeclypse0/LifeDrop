-- Removes what supabase/schema.sql added, for when it was run in the wrong project.
--
-- It is deliberately cautious. `drops` is unambiguously LifeDrop's and goes
-- without asking. `profiles`, the trigger and the function use
-- names common enough that another app may already have had them, so those are
-- only removed when they still look untouched — and the script says what it did.
--
-- Run it in the SQL editor, then read the Results / Messages pane.
--
-- The whole block is one transaction: if any statement fails, nothing is
-- applied. That is why the storage bucket is NOT removed here — Supabase
-- blocks direct deletes from storage.objects, and the error would roll the
-- rest back. Delete the bucket from Storage in the dashboard instead; the
-- final query below tells you whether it is still there.

do $$
declare
  prof_rows  bigint;
  prof_shape text;
  had_trigger boolean;
begin
  -- ---------------------------------------------------------------- drops --
  if to_regclass('public.drops') is not null then
    drop table public.drops cascade;
    raise notice 'REMOVED  table public.drops';
  else
    raise notice 'SKIPPED  table public.drops (not present)';
  end if;

  -- ------------------------------------------------------------- profiles --
  if to_regclass('public.profiles') is not null then
    execute 'select count(*) from public.profiles' into prof_rows;

    -- Match the exact column set, not just how many there are. A count alone
    -- would happily drop somebody else's four-column table.
    select string_agg(column_name, ',' order by column_name) into prof_shape
      from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles';

    if prof_rows = 0 and prof_shape = 'id,name,preferences,updated_at' then
      drop table public.profiles cascade;
      raise notice 'REMOVED  table public.profiles (empty, and its columns are exactly LifeDrop''s)';
    else
      raise notice 'KEPT     table public.profiles — % row(s), columns: %. Not LifeDrop''s; only its policies were removed.',
        prof_rows, prof_shape;
      drop policy if exists "profiles are private to their owner"  on public.profiles;
      drop policy if exists "profiles are inserted by their owner" on public.profiles;
      drop policy if exists "profiles are updated by their owner"  on public.profiles;
    end if;
  else
    raise notice 'SKIPPED  table public.profiles (not present)';
  end if;

  -- ------------------------------------------------- trigger and function --
  select exists (
    select 1 from information_schema.triggers
    where event_object_schema = 'auth'
      and event_object_table = 'users'
      and trigger_name = 'on_auth_user_created'
  ) into had_trigger;

  if had_trigger then
    drop trigger if exists on_auth_user_created on auth.users;
    raise notice 'REMOVED  trigger on_auth_user_created';
    raise notice 'CHECK    if this project had its OWN trigger by that name, it was overwritten and must be recreated.';
  end if;

  drop function if exists public.handle_new_user() cascade;
  raise notice 'REMOVED  function public.handle_new_user()';

  -- --------------------------------------------------------------- storage --
  -- Policies are ordinary objects and drop cleanly. The bucket itself has to
  -- go through the dashboard, so it is only reported on below.
  drop policy if exists "drop images are read by their owner"    on storage.objects;
  drop policy if exists "drop images are written by their owner" on storage.objects;
  drop policy if exists "drop images are deleted by their owner" on storage.objects;
  raise notice 'REMOVED  storage policies';

  raise notice '--- done ---';
  raise notice 'NEXT     delete the "drops" bucket by hand: Dashboard -> Storage -> drops -> Delete bucket.';
end $$;

-- Anything listed here is still present. The bucket row, if it appears, is the
-- one thing you have to remove from the Storage page yourself.
select 'table' as kind, table_name as name
from information_schema.tables
where table_schema = 'public' and table_name in ('drops', 'profiles')
union all
select 'bucket', id from storage.buckets where id = 'drops'
union all
select 'policy', policyname from pg_policies
where schemaname = 'storage' and policyname like 'drop images%';
