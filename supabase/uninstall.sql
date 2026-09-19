-- Removes what supabase/schema.sql added, for when it was run in the wrong project.
--
-- It is deliberately cautious. `drops` and the storage bucket are unambiguously
-- LifeDrop's and go without asking. `profiles`, the trigger and the function use
-- names common enough that another app may already have had them, so those are
-- only removed when they still look untouched — and the script says what it did.
--
-- Run it in the SQL editor, then read the Results / Messages pane.

do $$
declare
  prof_rows  bigint;
  prof_cols  int;
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
    select count(*) into prof_cols
      from information_schema.columns
      where table_schema = 'public' and table_name = 'profiles';

    -- LifeDrop's profiles has exactly four columns: id, name, preferences,
    -- updated_at. Anything else, or any row at all, means it is not mine.
    if prof_rows = 0 and prof_cols = 4 then
      drop table public.profiles cascade;
      raise notice 'REMOVED  table public.profiles (empty, matched LifeDrop shape)';
    else
      raise notice 'KEPT     table public.profiles — % row(s), % column(s). This is not LifeDrop''s; only its policies were removed.',
        prof_rows, prof_cols;
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
  drop policy if exists "drop images are read by their owner"    on storage.objects;
  drop policy if exists "drop images are written by their owner" on storage.objects;
  drop policy if exists "drop images are deleted by their owner" on storage.objects;
  raise notice 'REMOVED  storage policies';

  delete from storage.objects where bucket_id = 'drops';
  delete from storage.buckets where id = 'drops';
  raise notice 'REMOVED  storage bucket "drops"';

  raise notice '--- done ---';
end $$;

-- Confirm nothing of LifeDrop's is left.
select 'tables' as kind, table_name as name
from information_schema.tables
where table_schema = 'public' and table_name in ('drops', 'profiles')
union all
select 'bucket', id from storage.buckets where id = 'drops'
union all
select 'policy', policyname from pg_policies
where schemaname = 'storage' and policyname like 'drop images%';
