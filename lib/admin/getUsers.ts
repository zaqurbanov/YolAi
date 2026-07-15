import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface AdminUserRow {
  id: string;
  email: string | null;
  role: string;
  created_at: string;
  coinBalance: number | null;
  totalSpent: number | null;
}

// Assumes the caller has already run requireAdmin() — this is a plain
// data-fetcher, no auth check here. Relies on the profiles_select_admin RLS
// policy (0009_admin_read_policies.sql) to see rows beyond the caller's own.
export async function getAdminUsers(): Promise<AdminUserRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const users = data ?? [];

  // user_coins RLS (0036_coin_economy.sql) only grants a self-SELECT policy
  // — an admin's RLS-respecting client cannot read other users' rows, so
  // this uses the service-role client, legitimate here only because the
  // caller has already gated this whole page/data-fetcher behind
  // requireAdmin(). Users who have never sent a chat message have no
  // user_coins row yet — those are left as null below (not defaulted to 10
  // or any other assumed value) since this is informational display, not
  // the reset/floor-up "effective balance" logic in checkAndReserveCoins.
  const admin = createAdminClient();
  let { data: coinRows, error: coinError } = await admin
    .from('user_coins')
    .select('user_id, balance, total_spent');

  // 0039_user_coins_total_spent.sql adds total_spent, but migrations here are
  // applied manually (no runner — see CLAUDE.md) and may not have been run
  // yet against this DB. Postgres surfaces a missing column as 42703
  // (undefined_column) via PostgrestError.code. Retry without total_spent in
  // that specific case so the page degrades gracefully instead of 500ing;
  // any other error (permissions, network, etc.) still throws. Keep this
  // fallback indefinitely — it's cheap insurance against this exact class of
  // "migration not yet applied" bug and shouldn't be removed once 0039 lands.
  if (coinError?.code === '42703') {
    const fallback = await admin.from('user_coins').select('user_id, balance');
    coinRows = (fallback.data ?? []).map((row) => ({ ...row, total_spent: null }));
    coinError = fallback.error;
  }

  if (coinError) throw coinError;

  const coinsByUserId = new Map<string, { balance: number; total_spent: number | null }>(
    (coinRows ?? []).map((row) => [
      row.user_id,
      {
        balance: Number(row.balance),
        total_spent: row.total_spent === null || row.total_spent === undefined ? null : Number(row.total_spent),
      },
    ])
  );

  return users.map((u) => {
    const coins = coinsByUserId.get(u.id);
    return {
      ...u,
      coinBalance: coins ? coins.balance : null,
      totalSpent: coins ? coins.total_spent : null,
    };
  });
}
