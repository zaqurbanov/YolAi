-- Account page redesign needs user-editable display fields on profiles
-- (full_name, avatar_url) plus the ability for a user to update their own
-- row at all — no update policy on profiles exists yet (0002/0009/0010 only
-- added select policies), so without one, `app/account/actions.ts` updates
-- would silently match zero rows under RLS.
--
-- A plain `auth.uid() = id` update policy is not enough by itself: its
-- `with check` clause stays true even if the user smuggles `role: 'admin'`,
-- a different `email`, or a different `id` into the same update payload,
-- since the check only re-verifies the row still belongs to them *after*
-- the write. RLS policies can't inspect "did this column change" — that
-- needs a trigger. So we add a BEFORE UPDATE trigger, running as
-- SECURITY DEFINER (same reasoning as is_admin() in
-- 0010_fix_profiles_admin_recursion.sql: it must read/compare privileged
-- state without being re-subject to the RLS it's helping enforce), that
-- pins id/email back to their old values unconditionally and only allows
-- role to change when the *acting* user (auth.uid(), i.e. an admin doing
-- the update from the admin UI) is an admin — a self-service profile edit
-- can never touch role/email/id, only an admin actor can change role.

alter table profiles add column full_name text;
alter table profiles add column avatar_url text;

create policy "profiles_update_own" on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create or replace function guard_profile_columns() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.id := old.id;
  new.email := old.email;
  if new.role is distinct from old.role and not is_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_columns
  before update on profiles
  for each row execute function guard_profile_columns();

-- No extra cleanup migration needed for account deletion: profiles.id
-- already cascades from auth.users (0001_init.sql), and
-- conversations.user_id -> profiles / messages.conversation_id ->
-- conversations both already cascade too, so deleting the auth.users row
-- (via supabase.auth.admin.deleteUser in app/account/actions.ts) removes
-- the profile, conversations, and messages transitively.
