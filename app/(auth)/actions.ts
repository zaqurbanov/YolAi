'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { lookupReferrerByCode, grantReferralBonus } from '@/lib/coins/referrals';

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

  const refCode = formData.get('ref');

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) return { error: error.message };

  // Referral crediting is best-effort and must never block or alter the
  // signup redirect: an invalid code, a self-referral (e.g. someone
  // pasting their own link), a lookup failure, or an RPC error should all
  // fail silently and only be log-only server-side (per the coin-roadmap
  // Phase 2 spec). data.user can be null here for email-confirmation
  // signup flows (no session/user established yet) — skip crediting
  // defensively in that case rather than crashing.
  if (typeof refCode === 'string' && refCode.trim() && data.user?.id) {
    const newUserId = data.user.id;
    try {
      const referrer = await lookupReferrerByCode(refCode);
      if (referrer) {
        await grantReferralBonus(referrer.id, newUserId);
      }
    } catch (err) {
      console.error('[auth] referral bonus crediting failed on signup:', err);
    }
  }

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
