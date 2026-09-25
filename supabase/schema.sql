-- JUMBO: one row per person, holding their whole record.
--
-- Already applied to the Jumbo project as the migrations
-- `jumbo_state_with_rls` and `lock_down_touch_function`. Kept here as the
-- record of what the database holds, and to bring a fresh project up to the
-- same shape: paste it into Dashboard > SQL Editor > New query > Run. It is
-- safe to run again; every statement checks first.
--
-- READ THIS BEFORE SKIPPING THE POLICIES.
--
-- Supabase's publishable key is meant to be public and ships in the browser.
-- What stops one person reading another's health record is Row Level
-- Security, and nothing else. With RLS off, that key opens everybody's
-- record. The policies below are not optional hardening; they are the
-- whole of the access control.

create table if not exists public.jumbo_state (
  -- The person, as Supabase Auth knows them. Deleting the account deletes
  -- the record with it.
  id uuid primary key references auth.users on delete cascade,

  -- Everything Jumbo keeps, as one document. The client merges per record
  -- before writing, so two devices do not overwrite each other.
  state jsonb not null default '{}'::jsonb,

  -- Which save is newer. The client compares this before merging.
  updated_at timestamptz not null default now()
);

alter table public.jumbo_state enable row level security;

-- A person can see their own row and no other. auth.uid() is the signed-in
-- user, decided by the server from the session, so it cannot be forged from
-- the browser.
drop policy if exists "read own record" on public.jumbo_state;
create policy "read own record"
  on public.jumbo_state for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "create own record" on public.jumbo_state;
create policy "create own record"
  on public.jumbo_state for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "update own record" on public.jumbo_state;
create policy "update own record"
  on public.jumbo_state for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "delete own record" on public.jumbo_state;
create policy "delete own record"
  on public.jumbo_state for delete
  to authenticated
  using ((select auth.uid()) = id);

-- updated_at is set by the database rather than trusted from the client, so
-- a device with a wrong clock cannot make its copy look newer than it is.
create or replace function public.touch_jumbo_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jumbo_state_touch on public.jumbo_state;
create trigger jumbo_state_touch
  before update on public.jumbo_state
  for each row execute function public.touch_jumbo_state();

-- The trigger function is for the trigger, not for callers. Anything in the
-- public schema is exposed over PostgREST, so without this it is reachable
-- at /rest/v1/rpc/touch_jumbo_state by anyone holding the publishable key.
-- The trigger still fires; only the direct call goes away.
revoke all on function public.touch_jumbo_state() from public;
revoke all on function public.touch_jumbo_state() from anon;
revoke all on function public.touch_jumbo_state() from authenticated;
