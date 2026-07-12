'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

export async function changeEmail(
  _prevState: AccountFormState,
  formData: FormData
): Promise<AccountFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Giriş tələb olunur' };

  const email = formData.get('email');
  if (typeof email !== 'string' || !email.trim()) {
    return { error: 'Email tələb olunur' };
  }

  const { error } = await supabase.auth.updateUser({ email: email.trim() });

  if (error) return { error: error.message };

  return { success: 'Təsdiq linki yeni ünvana göndərildi' };
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
