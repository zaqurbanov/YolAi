'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface AuthFormState {
  error?: string;
}

export async function login(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = formData.get('email');
  const password = formData.get('password');

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: 'Email və şifrə tələb olunur' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { error: error.message };

  redirect('/chat');
}

export async function signup(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = formData.get('email');
  const password = formData.get('password');

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: 'Email və şifrə tələb olunur' };
  }
  if (password.length < 8) {
    return { error: 'Şifrə ən azı 8 simvol olmalıdır' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password });

  if (error) return { error: error.message };

  redirect('/chat');
}

export async function signInWithGoogle() {
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${siteUrl}/auth/callback` },
  });

  if (error) redirect('/login?error=' + encodeURIComponent(error.message));

  redirect(data.url);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
