-- JUMBO: one row per person, holding their whole record.
--
-- Run this once in the Supabase SQL editor (Dashboard > SQL Editor > New
-- query > paste > Run). It is safe to run again; every statement checks
-- first.
--
-- READ THIS BEFORE SKIPPING THE POLICIES.
--
-- Supabase's anon key is meant to be public and ships in the browser. What
-- stops one person reading another's health record is Row Level Security,
-- and nothing else. With RLS off, the anon key is a key to everybody's
-- data. The policies below are not optional hardening; they are the whole
-- of the access control.

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
  using (auth.uid() = id);

drop policy if exists "create own record" on public.jumbo_state;
create policy "create own record"
  on public.jumbo_state for insert
  with check (auth.uid() = id);

drop policy if exists "update own record" on public.jumbo_state;
create policy "update own record"
  on public.jumbo_state for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "delete own record" on public.jumbo_state;
create policy "delete own record"
  on public.jumbo_state for delete
  using (auth.uid() = id);

-- updated_at is set by the database rather than trusted from the client, so
-- a device with a wrong clock cannot make its copy look newer than it is.
create or replace function public.touch_jumbo_state()
returns trigger
language plpgsql
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
