import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { lookupReferrerByCode, recordPendingReferral } from '@/lib/coins/referrals';

// Only credit a referral for an account that this very callback just created.
// Google is now the sole sign-in path, so this handler runs on every login as
// well as every signup, and without an age check an EXISTING user could be
// handed a referrer simply by opening someone's invite link and signing in
// again. `referrals.referred_id` is unique so a second attempt is a no-op
// either way, but that only protects users who already have a referrer —
// this window is what protects everyone else.
const NEW_ACCOUNT_WINDOW_MS = 60_000;

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('Google ilə giriş uğursuz oldu')}`
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(error.message)}`);
  }

  // Referral capture moved here from the (now deleted) email/password signup
  // action — see app/(auth)/actions.ts. Still best-effort and strictly
  // non-blocking: an invalid code, a self-referral, a lookup failure or an
  // RPC error must never prevent a successful login from completing. No coins
  // are granted at this point; this only records the pending relationship,
  // which is paid out later from the referred user's first completed chat
  // message (claimPendingReferral in app/api/chat/route.ts).
  const refCode = searchParams.get('ref');
  const user = data.user;

  if (refCode && user?.id && user.created_at) {
    const accountAgeMs = Date.now() - new Date(user.created_at).getTime();
    if (accountAgeMs <= NEW_ACCOUNT_WINDOW_MS) {
      try {
        const referrer = await lookupReferrerByCode(refCode);
        if (referrer) await recordPendingReferral(referrer.id, user.id);
      } catch (err) {
        console.error('[auth] recording pending referral failed on OAuth callback:', err);
      }
    }
  }

  return NextResponse.redirect(`${origin}/chat`);
}
