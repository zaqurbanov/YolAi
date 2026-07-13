-- Adds a 'super_admin' role tier above 'admin'. Super admins can promote/
-- demote other users between 'admin' and 'user' (see
-- app/api/admin/users/[id]/role/route.ts); granting 'super_admin' itself
-- stays a manual DB operation (see instructions returned alongside this
-- migration), never reachable via the app, to avoid privilege escalation
-- through the role-change API.

alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check
  check (role in ('user', 'admin', 'super_admin'));

-- is_admin() (0010_fix_profiles_admin_recursion.sql) gated existing
-- admin-only RLS policies on role = 'admin' only; widen it so super_admins
-- keep every read/write path that regular admins already have.
create or replace function is_admin() returns boolean
language sql security definer stable
as $$ select exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'super_admin')) $$;

create or replace function is_super_admin() returns boolean
language sql security definer stable
as $$ select exists (select 1 from profiles where id = auth.uid() and role = 'super_admin') $$;

-- No profiles UPDATE policy existed before this migration (role changes were
-- not possible from the app at all). Restrict updates to super_admins only;
-- the app-level route additionally refuses to ever set role = 'super_admin'
-- through this path.
create policy "profiles_update_super_admin" on profiles
  for update using (is_super_admin()) with check (is_super_admin());
