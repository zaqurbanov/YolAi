-- ===========================================================================
-- 0103 — /qiymetler must be readable by LOGGED-OUT visitors.
-- ===========================================================================
--
-- THE BUG. 0101 gave billing_packages a single select policy, `to
-- authenticated`. /qiymetler is a PUBLIC page — proxy.ts guards only /chat,
-- /admin, /account and /oyrenme — so an anonymous visitor's read returned zero
-- rows and the page rendered its "planlar hazırlanır" empty state no matter how
-- many active packages existed. Verified live: the anon key returns 0 rows for
-- `status = 'active'` where the service role returns 2.
--
-- A pricing page that is blank for everyone who has not signed up yet is the
-- exact opposite of what a pricing page is for.
--
-- WHY WIDENING THE POLICY IS THE RIGHT FIX, rather than reading these rows with
-- the service-role client in TypeScript: an ACTIVE package row is marketing
-- copy — name, description, price, the daily floors it grants, whether it
-- removes ads. It is the text we want on a public page. Nothing in it is user
-- data. Draft and archived rows stay invisible to everyone but the service
-- role, which is the part that actually needed protecting (an unfinished price
-- must never be quoted).
--
-- Keeping it in RLS also keeps the guarantee in ONE place: no TS caller can
-- accidentally list drafts, because the database will not return them.
-- ---------------------------------------------------------------------------

drop policy if exists billing_packages_select_active on billing_packages;

create policy billing_packages_select_active
  on billing_packages for select
  to anon, authenticated
  using (status = 'active');

-- anon needs the table-level grant as well as the policy: RLS filters rows,
-- GRANT decides whether the role may issue the SELECT at all. Both are
-- required, and forgetting the grant is the usual reason a correct-looking
-- policy still returns nothing.
grant select on billing_packages to anon, authenticated;
