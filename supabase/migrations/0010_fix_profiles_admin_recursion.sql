-- Fixes 42P17 infinite recursion introduced in 0009_admin_read_policies.sql:
-- "profiles_select_admin" was defined as a SELECT policy on profiles whose
-- USING clause itself ran `select ... from profiles`, so evaluating the
-- policy re-triggered RLS on profiles, which re-evaluated the same policy,
-- forever. Any select against profiles (admin or not) failed with 42P17.
--
-- Fix: move the admin check into a SECURITY DEFINER function. Such a
-- function runs with the privileges of its owner and is not subject to the
-- RLS policies of the calling role, so its internal `select ... from
-- profiles` does not re-trigger the outer policy's own evaluation.

drop policy if exists "profiles_select_admin" on profiles;

create or replace function is_admin() returns boolean
language sql security definer stable
as $$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

create policy "profiles_select_admin" on profiles
  for select using (is_admin());
