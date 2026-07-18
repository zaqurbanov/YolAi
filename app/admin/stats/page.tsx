import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { getAdminStats } from '@/lib/admin/getStats';
import { ChatIcon, DocumentIcon, IntersectionIcon, SparkleIcon, UserIcon } from '@/components/icons';

export const metadata: Metadata = {
  title: 'Statistika',
};

// Literal Tailwind class names per accent (not template-string interpolation) so
// Tailwind v4's content scanner can see every class — same pattern as
// components/CategoryCard.tsx's ACCENT_STYLES, reused here for the stat-tile bento grid.
const ACCENT_STYLES = [
  { icon: 'text-primary', chip: 'bg-primary/15 text-primary' },
  { icon: 'text-regulatory-blue', chip: 'bg-regulatory-blue/15 text-regulatory-blue' },
  { icon: 'text-safety-yellow', chip: 'bg-safety-yellow/15 text-safety-yellow' },
  { icon: 'text-go-green', chip: 'bg-go-green/15 text-go-green' },
  { icon: 'text-caution-orange', chip: 'bg-caution-orange/15 text-caution-orange' },
] as const;

const STATUS_LABELS = {
  ready: 'Hazır',
  processing: 'Emal olunur',
  pending: 'Gözləyir',
  failed: 'Uğursuz',
} as const;

// Cycles the same traffic accents as ACCENT_STYLES, but keyed by document status
// semantics rather than position: ready=go-green, processing=regulatory-blue,
// pending=safety-yellow, failed=caution-orange (kept off --danger since "failed"
// here is a processing outcome, not a security/error condition).
const STATUS_ACCENTS = {
  ready: { bar: 'bg-go-green', text: 'text-go-green' },
  processing: { bar: 'bg-regulatory-blue', text: 'text-regulatory-blue' },
  pending: { bar: 'bg-safety-yellow', text: 'text-safety-yellow' },
  failed: { bar: 'bg-caution-orange', text: 'text-caution-orange' },
} as const;

export default async function AdminStatsPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  const stats = await getAdminStats();

  const cards = [
    { label: 'Sənədlər', value: stats.documents.total, Icon: DocumentIcon },
    { label: 'Fraqmentlər (chunks)', value: stats.chunks.total, Icon: IntersectionIcon },
    { label: 'İstifadəçilər', value: stats.users.total, Icon: UserIcon },
    { label: 'Söhbətlər', value: stats.conversations.total, Icon: ChatIcon },
    {
      label: 'Mesajlar',
      value: stats.messages.total,
      sub: `Son 7 gün: ${stats.messages.last7Days}`,
      Icon: SparkleIcon,
    },
  ];

  const statusOrder = Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[];
  const documentsTotal = stats.documents.total;

  return (
    <div className="pt-6 space-y-8">
      <div className="space-y-1">
        <h1 className="text-headline-md text-on-surface">Statistika</h1>
        <p className="text-body-md text-on-surface-variant">
          Yol AI sisteminin cari fəaliyyət göstəricilərinin icmalı.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {cards.map((c, i) => {
          const accent = ACCENT_STYLES[i % ACCENT_STYLES.length];
          return (
            <div
              key={c.label}
              className="glass-card group relative overflow-hidden rounded-2xl p-6"
            >
              <div
                className={`pointer-events-none absolute -top-2 -right-2 opacity-10 transition-opacity duration-200 group-hover:opacity-20 ${accent.icon}`}
              >
                <c.Icon width={80} height={80} strokeWidth={1} />
              </div>
              <div className="relative z-10 flex h-full flex-col justify-between gap-6">
                <div className="space-y-2">
                  <span className="text-legal-citation text-on-surface-variant">{c.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-headline-md text-[32px] text-on-surface">{c.value}</span>
                  </div>
                </div>
                {c.sub && (
                  <div className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold ${accent.chip}`}>
                    {c.sub}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-headline-md text-[18px] text-on-surface mb-1">Sənəd statusları</h2>
        <p className="text-body-md text-on-surface-variant mb-6">
          Yüklənmiş sənədlərin emal statusu üzrə paylanması ({documentsTotal} sənəd).
        </p>
        <div className="space-y-5">
          {statusOrder.map((status) => {
            const value = stats.documents.byStatus[status];
            const pct = documentsTotal > 0 ? Math.round((value / documentsTotal) * 100) : 0;
            const accent = STATUS_ACCENTS[status];
            return (
              <div key={status} className="space-y-2">
                <div className="flex justify-between text-body-md">
                  <span className="text-on-surface">{STATUS_LABELS[status]}</span>
                  <span className={`font-semibold ${accent.text}`}>
                    {value} <span className="text-on-surface-variant font-normal">({pct}%)</span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
                  <div
                    className={`h-full rounded-full ${accent.bar} transition-all duration-500`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
