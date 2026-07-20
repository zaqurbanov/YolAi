'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface AuthFormState {
  error?: string;
}

// SIGN-UP IS GOOGLE-ONLY; SIGN-IN ACCEPTS GOOGLE OR AN EXISTING PASSWORD.
//
// There is deliberately no `signup()` action here. Deleting it does NOT by
// itself stop account creation — `NEXT_PUBLIC_SUPABASE_ANON_KEY` ships in the
// client bundle by design, so anyone can call `supabase.auth.signUp()`
// against the project directly, bypassing this file entirely (verified live:
// a `.invalid` address created an account and received an active session even
// after this action was removed). The actual control is Supabase's
// **"Confirm email"** setting, which must stay ON:
//
//   - existing password users already have `email_confirmed_at` set, so they
//     keep signing in through `login()` below;
//   - a fabricated address can still create a row, but never receives a
//     session, so it cannot chat, earn, or transfer coins — the account is
//     inert rather than merely unverified;
//   - new legitimate users take the Google path, which needs no mail at all.
//
// This is why no SMTP provider is required: undeliverable confirmation mail
// is not a gap here, it *is* the mechanism that neutralises fake signups.
// Supabase's built-in mailer only delivers to project team members (~2/hour),
// and every no-custom-domain alternative (Gmail SMTP, single-sender
// verification on SendGrid/Brevo) risks landing in spam, so real confirmation
// mail was never a practical option for this project.
//
// If a domain + real SMTP are added later and password signup is restored:
// `signup()` must handle `data.session === null` (confirmation pending)
// rather than redirecting to /chat, or the user lands on a protected route
// with no session and is bounced to /login with no explanation.

export async function login(_prevState: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = formData.get('email');
  const password = formData.get('password');

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: 'Email və şifrə tələb olunur' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Two cases are worth distinguishing, and only two.
    //
    // "Email not confirmed" is a dead end for this project specifically:
    // there is no working SMTP, so the confirmation mail will never arrive
    // and telling the user to "check your inbox" would strand them. Point
    // them at Google instead, which is the only way such an account can
    // become usable.
    //
    // Everything else collapses to one generic message rather than echoing
    // the provider's text, so this endpoint can't be used to probe which
    // addresses are registered (the same reason lookupRecipientByEmail's
    // caller in app/account/actions.ts merges its "not found" and
    // "self-transfer" branches).
    const raw = error.message.toLowerCase();
    if (raw.includes('not confirmed')) {
      return {
        error:
          'Bu hesabın email ünvanı təsdiqlənməyib. Zəhmət olmasa eyni email ilə “Google ilə davam et” düyməsindən istifadə edin.',
      };
    }
    return { error: 'Email və ya şifrə yanlışdır' };
  }

  redirect('/chat');
}

export async function signInWithGoogle(formData?: FormData) {
  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

  // The referral code has to ride through the OAuth round trip, because the
  // hidden form field that used to carry it (on the now-removed signup form)
  // is gone. Without this, every referral link would silently stop crediting
  // the moment Google became the only entry point.
  //
  // Sanitised to the generator's own alphabet (CODE_ALPHABET in
  // lib/coins/referrals.ts is 0-9 + A-Z minus O/I) and length-capped before
  // being placed in the redirect target, so nothing user-controlled is
  // reflected into a URL unchecked.
  const rawRef = formData?.get('ref');
  const ref = typeof rawRef === 'string' ? rawRef.trim().toUpperCase().slice(0, 16) : '';
  const safeRef = ref && /^[0-9A-Z]+$/.test(ref) ? ref : '';

  const callbackUrl = safeRef
    ? `${siteUrl}/auth/callback?ref=${encodeURIComponent(safeRef)}`
    : `${siteUrl}/auth/callback`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: callbackUrl },
  });

  if (error) redirect('/login?error=' + encodeURIComponent(error.message));

  redirect(data.url);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
