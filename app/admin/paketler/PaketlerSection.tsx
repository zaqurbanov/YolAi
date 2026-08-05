import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { listPackages } from '@/lib/billing/packages';
import { listSubscriptions } from '@/lib/billing/subscriptions';
import { listBillingRequests } from '@/lib/billing/requests';
import PaketlerClient from './PaketlerClient';
import SubscriptionsPanel from './SubscriptionsPanel';
import RequestsPanel from './RequestsPanel';

// Layer 2 of 3 (see the comment in app/admin/[[...slug]]/page.tsx): the
// catch-all route already ran requireAdmin, this section re-checks before its
// own data read, and every server action it calls checks independently.
export default async function PaketlerSection() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  const [packages, subscriptions, requests] = await Promise.all([
    listPackages(),
    listSubscriptions(),
    listBillingRequests(),
  ]);

  // Only an ACTIVE subscription package can be granted — a draft has no
  // agreed price and an archived one is no longer sold.
  const grantable = packages.filter((p) => p.kind === 'subscription' && p.status === 'active');

  return (
    <div className="space-y-8 pt-6">
      <div className="space-y-1">
        <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-primary">
          Monetizasiya
        </span>
        <h1 className="text-[28px] font-semibold leading-tight text-navy">Paketlər</h1>
      </div>

      <PaketlerClient initialPackages={packages} />

      {/* Requests first: it is the queue the owner actually works through, and
          the grant form below is where each one ends up. */}
      <RequestsPanel initial={requests} />

      <SubscriptionsPanel packages={grantable} initialSubscriptions={subscriptions} />
    </div>
  );
}
