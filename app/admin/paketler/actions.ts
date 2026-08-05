'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import {
  createPackage,
  deletePackage,
  listPackages,
  updatePackage,
  type BillingPackage,
  type PackageInput,
} from '@/lib/billing/packages';
import {
  cancelSubscription,
  findUserIdByEmail,
  grantSubscription,
  listSubscriptions,
  type SubscriptionListRow,
} from '@/lib/billing/subscriptions';
import {
  deleteBillingRequest,
  listBillingRequests,
  setBillingRequestStatus,
  type BillingRequest,
  type RequestStatus,
} from '@/lib/billing/requests';

// Admin server actions for the billing catalog.
//
// EVERY action opens with an unconditional requireAdmin(). A server action is a
// plain POST endpoint that any authenticated client can invoke with arbitrary
// arguments — the admin UI never being rendered for a normal user is not a
// gate. The check is the FIRST statement, never inside an `if`, and everything
// below it runs with the service-role client which bypasses RLS. Same shape as
// app/admin/kurslar/actions.ts.
//
// These are the ONLY write path to package prices. Nothing else in the app may
// write billing_packages — a price the user could influence is a price the user
// could set to zero.

export type AdminActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function denied(message: string): { ok: false; error: string } {
  return { ok: false, error: message };
}

export async function listPackagesAction(): Promise<AdminActionResult<BillingPackage[]>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  return { ok: true, data: await listPackages() };
}

export async function createPackageAction(
  input: PackageInput
): Promise<AdminActionResult<BillingPackage>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await createPackage(input);
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/paketler');
  return { ok: true, data: result.data };
}

export async function updatePackageAction(
  id: string,
  input: PackageInput
): Promise<AdminActionResult<BillingPackage>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await updatePackage(id, input);
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/paketler');
  return { ok: true, data: result.data };
}

export async function deletePackageAction(id: string): Promise<AdminActionResult<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await deletePackage(id);
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/paketler');
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Subscriptions
//
// A MANUAL GRANT IS NOT A STOPGAP — it is what makes the mechanic real before
// any payment provider exists, and it stays useful afterwards (support cases,
// comps, testing). A payment callback will later call the same
// grantSubscription() with its own `source`.
// ---------------------------------------------------------------------------

export async function listSubscriptionsAction(): Promise<AdminActionResult<SubscriptionListRow[]>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  return { ok: true, data: await listSubscriptions() };
}

export async function grantSubscriptionAction(
  email: string,
  packageId: string,
  days?: number | null
): Promise<AdminActionResult<{ expiresAt: string }>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const userId = await findUserIdByEmail(email);
  if (!userId) return denied('Bu e-poçtla istifadəçi tapılmadı');

  const result = await grantSubscription(userId, packageId, { days, source: 'admin' });
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/paketler');
  revalidatePath('/qiymetler');
  return { ok: true, data: result.data };
}

export async function cancelSubscriptionAction(userId: string): Promise<AdminActionResult<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await cancelSubscription(userId);
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/paketler');
  revalidatePath('/qiymetler');
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Plan requests (0104)
//
// The submission side is public and lives in app/qiymetler/actions.ts; only
// reading and triaging them is admin-gated.
// ---------------------------------------------------------------------------

export async function listRequestsAction(): Promise<AdminActionResult<BillingRequest[]>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  return { ok: true, data: await listBillingRequests() };
}

export async function setRequestStatusAction(
  id: string,
  status: RequestStatus
): Promise<AdminActionResult<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await setBillingRequestStatus(id, status);
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/paketler');
  return { ok: true, data: null };
}

export async function deleteRequestAction(id: string): Promise<AdminActionResult<null>> {
  const admin = await requireAdmin();
  if (!admin.ok) return denied(admin.message);

  const result = await deleteBillingRequest(id);
  if (!result.ok) return denied(result.error);

  revalidatePath('/admin/paketler');
  return { ok: true, data: null };
}
