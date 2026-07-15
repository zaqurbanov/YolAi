-- Adds a notification insert to transfer_coins (0041_coin_transfers.sql),
-- right after the successful coin_transfers insert, so the recipient's
-- notification is atomic with the transfer itself (per explicit product
-- preference for this specific trigger — contrast with the admin-answer
-- notification in lib/admin/questions.ts, which is a plain non-transactional
-- TS-side insert since there's no equivalent race there).
--
-- CREATE OR REPLACE FUNCTION with an unchanged signature preserves prior
-- grants in Postgres (revoking/re-granting EXECUTE does not happen
-- implicitly on replace) — but the revoke/grant lines below are re-issued
-- anyway, defensively and idempotently, per 0037's hard-learned lesson
-- about service_role needing an explicit grant.
create or replace function transfer_coins(
  p_sender_id uuid,
  p_recipient_id uuid,
  p_amount numeric,
  p_default_daily_limit numeric,
  p_daily_transfer_cap numeric
)
returns table (
  sender_balance numeric,
  recipient_balance numeric
)
language plpgsql
as $$
declare
  v_sender_balance numeric;
  v_sender_daily_limit numeric;
  v_recipient_balance numeric;
  v_effective_daily_limit numeric;
  v_transferable numeric;
  v_already_sent_today numeric;
  v_sender_balance_after numeric;
  v_recipient_balance_after numeric;
begin
  if p_sender_id = p_recipient_id then
    raise exception 'sender_equals_recipient';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_sender_id, p_default_daily_limit, null)
  on conflict (user_id) do nothing;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_recipient_id, p_default_daily_limit, null)
  on conflict (user_id) do nothing;

  if p_sender_id < p_recipient_id then
    select uc.balance, uc.daily_limit into v_sender_balance, v_sender_daily_limit
      from user_coins uc where uc.user_id = p_sender_id for update;
    select uc.balance into v_recipient_balance
      from user_coins uc where uc.user_id = p_recipient_id for update;
  else
    select uc.balance into v_recipient_balance
      from user_coins uc where uc.user_id = p_recipient_id for update;
    select uc.balance, uc.daily_limit into v_sender_balance, v_sender_daily_limit
      from user_coins uc where uc.user_id = p_sender_id for update;
  end if;

  v_effective_daily_limit := coalesce(v_sender_daily_limit, p_default_daily_limit);
  v_transferable := greatest(0, v_sender_balance - v_effective_daily_limit);

  if p_amount > v_transferable then
    raise exception 'insufficient_transferable_balance';
  end if;

  select coalesce(sum(ct.amount), 0) into v_already_sent_today
    from coin_transfers ct
    where ct.sender_id = p_sender_id
      and ct.created_at >= date_trunc('day', now());

  if v_already_sent_today + p_amount > p_daily_transfer_cap then
    raise exception 'daily_transfer_cap_exceeded';
  end if;

  update user_coins uc
    set balance = uc.balance - p_amount
    where uc.user_id = p_sender_id
    returning uc.balance into v_sender_balance_after;

  update user_coins uc
    set balance = uc.balance + p_amount
    where uc.user_id = p_recipient_id
    returning uc.balance into v_recipient_balance_after;

  insert into coin_transfers (sender_id, recipient_id, amount)
  values (p_sender_id, p_recipient_id, p_amount);

  insert into notifications (user_id, message, link)
  values (p_recipient_id, 'Sizə ' || p_amount || ' coin köçürüldü', '/account');

  return query select v_sender_balance_after, v_recipient_balance_after;
end;
$$;

revoke execute on function transfer_coins(uuid, uuid, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function transfer_coins(uuid, uuid, numeric, numeric, numeric) to service_role;

grant select, insert, update on coin_transfers to service_role;
grant select, insert, update on user_coins to service_role;
grant select, insert, update on notifications to service_role;
