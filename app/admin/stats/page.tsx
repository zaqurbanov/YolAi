import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { getAdminStats } from '@/lib/admin/getStats';

export const metadata: Metadata = {
  title: 'Statistika',
};

const STATUS_LABELS = {
  pending: 'Gözləyir',
  processing: 'Emal olunur',
  ready: 'Hazır',
  failed: 'Uğursuz',
} as const;

export default async function AdminStatsPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  const stats = await getAdminStats();

  const cards = [
    { label: 'Sənədlər', value: stats.documents.total },
    { label: 'Fraqmentlər (chunks)', value: stats.chunks.total },
    { label: 'İstifadəçilər', value: stats.users.total },
    { label: 'Söhbətlər', value: stats.conversations.total },
    { label: 'Mesajlar', value: stats.messages.total, sub: `Son 7 gün: ${stats.messages.last7Days}` },
  ];

  return (
    <div className="pt-6 space-y-8">
      <h1 className="text-2xl font-semibold">Statistika</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className="glass-card rounded-2xl p-4">
            <div className="mono-label text-on-surface-variant uppercase">{c.label}</div>
            <div className="mt-2 text-2xl font-semibold text-on-surface">{c.value}</div>
            {c.sub && <div className="mt-1 mono-label text-on-surface-variant">{c.sub}</div>}
          </div>
        ))}
      </div>

      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-4">Sənəd statusları</h2>
        <div className="flex flex-wrap gap-4">
          {(Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).map((status) => (
            <div key={status} className="glass-panel rounded-xl px-4 py-3 min-w-32">
              <div className="mono-label text-on-surface-variant uppercase">{STATUS_LABELS[status]}</div>
              <div className="mt-1 text-xl font-semibold text-on-surface">
                {stats.documents.byStatus[status]}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
