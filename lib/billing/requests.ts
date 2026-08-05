import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { logError } from '@/lib/logging/logError';
import { getActivePackage } from '@/lib/billing/packages';

// Plan requests (0104_billing_requests.sql) — the interim "contact me" lane
// while there is no online payment path.
//
// AUTHORIZATION: submissions are PUBLIC by design (see the 0104 header), so
// this module is the only validation layer that exists. Everything a caller
// sends is untrusted: the package id is re-resolved against ACTIVE packages
// here, and the email/phone are normalised and length-capped before they reach
// the database. Admin reads/writes below are reachable only from server
// actions that run requireAdmin() first.

export type RequestStatus = 'new' | 'contacted' | 'done' | 'rejected';

export interface BillingRequest {
  id: string;
  packageId: string;
  packageName: string;
  userId: string | null;
  email: string;
  phone: string;
  note: string | null;
  status: RequestStatus;
  createdAt: string;
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: string };

// Deliberately permissive: the goal is to catch typos and obvious junk, not to
// enforce RFC 5322. A real address that this rejects is a lost customer.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MAX_EMAIL = 200;
const MAX_NOTE = 500;

/**
 * Normalises a phone number to "+digits" or "digits".
 *
 * Users type +994 50 123 45 67, 0501234567, (050) 123-45-67 — all the same
 * number. Storing them verbatim means the admin sees five formats and cannot
 * spot a duplicate; storing digits only means the leading + (and with it the
 * country code's meaning) is lost. So: strip everything except digits, keep a
 * single leading + if one was typed.
 */
function normalisePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');

  // 7 is the shortest plausible local number, 15 is the E.164 maximum.
  if (digits.length < 7 || digits.length > 15) return null;

  return hasPlus ? `+${digits}` : digits;
}

export interface SubmitRequestInput {
  packageId: string;
  email: string;
  phone: string;
  note?: string;
  /** Honeypot — must be empty. A human never sees this field. */
  website?: string;
  userId?: string | null;
}

export async function submitBillingRequest(input: SubmitRequestInput): Promise<SubmitResult> {
  // Honeypot first: a bot that fills every field it finds gets a plausible
  // success and writes nothing. Returning ok:true rather than an error is the
  // point — an error tells the bot which field betrayed it.
  if (input.website && input.website.trim() !== '') return { ok: true };

  const email = input.email.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) {
    return { ok: false, error: 'E-poçt ünvanı düzgün deyil' };
  }

  const phone = normalisePhone(input.phone);
  if (!phone) {
    return { ok: false, error: 'Telefon nömrəsi düzgün deyil' };
  }

  // The package is re-resolved server-side; a draft, archived or nonexistent id
  // must never produce a request row.
  const pkg = await getActivePackage(input.packageId);
  if (!pkg) return { ok: false, error: 'Paket tapılmadı' };

  const note = input.note?.trim().slice(0, MAX_NOTE) || null;

  const { error } = await createAdminClient().from('billing_requests').insert({
    package_id: pkg.id,
    user_id: input.userId ?? null,
    email,
    phone,
    note,
    status: 'new',
  });

  if (error) {
    // 23505 = the partial unique index: this address already has an OPEN
    // request for this package. Not an error from the user's point of view —
    // their message is already in the queue.
    if (error.code === '23505') {
      return { ok: false, error: 'Bu e-poçtla müraciətiniz artıq qeydə alınıb — tezliklə əlaqə saxlayacağıq' };
    }
    if (isMissingRelationError(error)) {
      return { ok: false, error: 'Müraciət cədvəli yaradılmayıb (0104 migrasiyası icra edilməyib)' };
    }
    void logError('billing.requests.submit', error, { details: { packageId: input.packageId } });
    console.error('[billing/requests] submitBillingRequest failed:', error);
    return { ok: false, error: 'Müraciəti göndərmək uğursuz oldu. Bir az sonra yenidən cəhd edin' };
  }

  return { ok: true };
}

/** Admin view, newest first. */
export async function listBillingRequests(limit = 100): Promise<BillingRequest[]> {
  const { data, error } = await createAdminClient()
    .from('billing_requests')
    .select('id, package_id, user_id, email, phone, note, status, created_at, billing_packages(name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    if (isMissingRelationError(error)) return [];
    void logError('billing.requests.list', error);
    console.error('[billing/requests] listBillingRequests failed:', error);
    return [];
  }

  return (
    data as unknown as Array<{
      id: string;
      package_id: string;
      user_id: string | null;
      email: string;
      phone: string;
      note: string | null;
      status: RequestStatus;
      created_at: string;
      billing_packages: { name: string } | { name: string }[] | null;
    }>
  ).map((row) => {
    const pkg = Array.isArray(row.billing_packages) ? row.billing_packages[0] : row.billing_packages;
    return {
      id: row.id,
      packageId: row.package_id,
      packageName: pkg?.name ?? '—',
      userId: row.user_id,
      email: row.email,
      phone: row.phone,
      note: row.note,
      status: row.status,
      createdAt: row.created_at,
    };
  });
}

export async function setBillingRequestStatus(
  id: string,
  status: RequestStatus
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await createAdminClient()
    .from('billing_requests')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    void logError('billing.requests.setStatus', error, { details: { requestId: id, status } });
    console.error('[billing/requests] setBillingRequestStatus failed:', error);
    return { ok: false, error: 'Statusu dəyişmək uğursuz oldu' };
  }

  return { ok: true };
}

export async function deleteBillingRequest(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await createAdminClient().from('billing_requests').delete().eq('id', id);

  if (error) {
    void logError('billing.requests.delete', error, { details: { requestId: id } });
    console.error('[billing/requests] deleteBillingRequest failed:', error);
    return { ok: false, error: 'Müraciəti silmək uğursuz oldu' };
  }

  return { ok: true };
}
