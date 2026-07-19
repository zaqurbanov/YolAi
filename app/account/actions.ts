'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTransferMinAmount, lookupRecipientByEmail, transferCoins as transferCoinsLib } from '@/lib/coins/transfers';

export interface AccountFormState {
  error?: string;
  success?: string;
}

export async function updateProfile(
  _prevState: AccountFormState,
  formData: FormData
): Promise<AccountFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Giriş tələb olunur' };

  const rawFullName = formData.get('full_name');
  const rawAvatarUrl = formData.get('avatar_url');

  const fullName = typeof rawFullName === 'string' ? rawFullName.trim() : '';
  if (fullName.length > 80) {
    return { error: 'Ad 80 simvoldan uzun ola bilməz' };
  }

  const avatarUrl = typeof rawAvatarUrl === 'string' ? rawAvatarUrl.trim() : '';
  if (avatarUrl && !avatarUrl.startsWith('http://') && !avatarUrl.startsWith('https://')) {
    return { error: 'Şəkil linki http:// və ya https:// ilə başlamalıdır' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName || null,
      avatar_url: avatarUrl || null,
    })
    .eq('id', user.id);

  if (error) return { error: error.message };

  revalidatePath('/account');
  return { success: 'Profil yeniləndi' };
}

export async function changePassword(
  _prevState: AccountFormState,
  formData: FormData
): Promise<AccountFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Giriş tələb olunur' };

  const password = formData.get('password');
  const confirmPassword = formData.get('confirmPassword');

  if (typeof password !== 'string' || typeof confirmPassword !== 'string') {
    return { error: 'Şifrə tələb olunur' };
  }
  if (password.length < 8) {
    return { error: 'Şifrə ən azı 8 simvol olmalıdır' };
  }
  if (password !== confirmPassword) {
    return { error: 'Şifrələr uyğun gəlmir' };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) return { error: error.message };

  return { success: 'Şifrə yeniləndi' };
}

// Phase 1 of the coin roadmap (docs/coin-roadmap.md). Mirrors
// changePassword's shape: auth check via createClient()+getUser(), validate
// formData, delegate to lib/coins/transfers.ts, map every failure to a
// user-facing Azerbaijani message (never raw Postgres/RPC text),
// revalidatePath('/account') on success so the balance/history refresh.
//
// "Recipient not found" and "recipient is yourself" deliberately share one
// generic message (account-enumeration mitigation per the roadmap's noted
// risk) — lookupRecipientByEmail already collapses both cases to null.
export async function transferCoins(
  _prevState: AccountFormState,
  formData: FormData
): Promise<AccountFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Giriş tələb olunur' };

  const rawEmail = formData.get('recipientEmail');
  const rawAmount = formData.get('amount');

  const recipientEmail = typeof rawEmail === 'string' ? rawEmail.trim() : '';
  if (!recipientEmail) {
    return { error: 'Alıcının email ünvanı tələb olunur' };
  }

  const amount = typeof rawAmount === 'string' ? Number(rawAmount) : NaN;
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Düzgün miqdar daxil edin' };
  }

  const minAmount = await getTransferMinAmount();
  if (amount < minAmount) {
    return { error: `Minimum köçürmə miqdarı ${minAmount} coindir` };
  }

  const recipient = await lookupRecipientByEmail(recipientEmail, user.id);
  if (!recipient) {
    return { error: 'Bu email ünvanı ilə istifadəçi tapılmadı' };
  }

  const result = await transferCoinsLib(user.id, recipient.id, amount);

  if (!result.ok) {
    switch (result.error) {
      case 'self_transfer':
        return { error: 'Bu email ünvanı ilə istifadəçi tapılmadı' };
      case 'insufficient_balance':
        return { error: 'Köçürmək üçün kifayət qədər coininiz yoxdur (gündəlik pulsuz limitiniz köçürülə bilməz)' };
      case 'daily_cap_exceeded':
        return { error: 'Gündəlik köçürmə limitini aşdınız' };
      case 'invalid_amount':
        return { error: 'Düzgün miqdar daxil edin' };
      default:
        return { error: 'Köçürmə zamanı xəta baş verdi. Bir az sonra yenidən cəhd edin' };
    }
  }

  revalidatePath('/account');
  return { success: `${amount} coin uğurla köçürüldü` };
}

export async function deleteAccount(formData: FormData): Promise<void> {
  void formData;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const adminClient = createAdminClient();
  const { error } = await adminClient.auth.admin.deleteUser(user.id);

  if (error) {
    redirect('/account?error=' + encodeURIComponent(error.message));
  }

  await supabase.auth.signOut();
  redirect('/login');
}
