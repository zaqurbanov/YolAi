'use server';

import { createClient } from '@/lib/supabase/server';
import { submitBillingRequest } from '@/lib/billing/requests';

// PUBLIC server action — deliberately no auth gate. /qiymetler is a public page
// and the whole point of the request form is to capture someone who has not
// signed up yet (see the 0104 header). Every guard therefore lives in
// submitBillingRequest(): package re-resolution against ACTIVE packages, email
// and phone validation, the honeypot, and the one-open-request-per-email index.
//
// The user id is read from the SESSION here, never accepted from the caller —
// otherwise a request could be attributed to someone else's account.
export async function submitPlanRequestAction(input: {
  packageId: string;
  email: string;
  phone: string;
  note?: string;
  website?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return submitBillingRequest({ ...input, userId: user?.id ?? null });
}
