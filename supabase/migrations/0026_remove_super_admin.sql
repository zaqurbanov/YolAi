-- Removes the unused 'super_admin' role tier introduced in
-- 0020_super_admin.sql. No user in the live DB has ever held super_admin
-- and there's no app path that grants it, but its only effect was to gate
-- the sole profiles UPDATE RLS policy behind is_super_admin(), leaving
-- regular admins unable to promote/demote via the app at all. Consolidate
-- back down to just 'user' and 'admin'.

-- Statements below are written to be safely re-runnable (if_exists /
-- or-replace / drop-if-exists) since an earlier run of this migration
-- failed partway through (dependency-order bug, since fixed) and Supabase's
-- SQL editor does not always wrap a pasted script in a single transaction.
update profiles set role = 'admin' where role = 'super_admin';

alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('user', 'admin'));

-- is_admin() no longer needs to consider super_admin.
create or replace function is_admin() returns boolean
language sql security definer stable
as $$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin') $$;

-- Policy must be dropped before the function it depends on.
drop policy if exists "profiles_update_super_admin" on profiles;

drop function if exists is_super_admin();

drop policy if exists "profiles_update_admin" on profiles;
create policy "profiles_update_admin" on profiles
  for update using (is_admin()) with check (is_admin());
