import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTopSpenders } from '@/lib/leaderboard/getLeaderboard';
import { createClient } from '@/lib/supabase/server';
import { SparkleIcon, ArrowLeftIcon } from '@/components/icons';

export const metadata: Metadata = {
  title: 'Liderlik lövhəsi',
};

const MEDAL_STYLES: Record<number, string> = {
  1: 'bg-safety-yellow/15 text-safety-yellow',
  2: 'bg-outline-variant/30 text-on-surface',
  3: 'bg-caution-orange/15 text-caution-orange',
};

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const entries = await getTopSpenders(10);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 pt-8 pb-16 md:px-8">
      <div>
        <Link
          href="/account"
          className="mb-4 inline-flex items-center gap-1.5 text-label-sm text-on-surface-variant hover:text-on-surface"
        >
          <ArrowLeftIcon width={14} height={14} />
          Hesaba qayıt
        </Link>
        <h1 className="text-headline-md text-on-surface">Liderlik lövhəsi</h1>
        {/* Same "motivational, not a real qualification" posture as the
            knowledge-level bar on /account — this ranks app engagement
            (coin spend), not legal knowledge or competency. */}
        <p className="mt-1 text-body-md text-on-surface-variant">
          Tətbiqdə ən aktiv istifadəçilər — hüquqi bilik səviyyəsi ilə əlaqəli deyil, yalnız fəallığı əks etdirir.
        </p>
      </div>

      <div className="glass-card rounded-2xl p-2 sm:p-4">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <SparkleIcon />
            </div>
            <p className="text-body-md text-on-surface-variant">
              Hələ heç kim siyahıya düşməyib. Söhbətə başla və ilk yeri tut!
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-outline-variant/20">
            {entries.map((entry) => (
              <li key={entry.rank} className="flex items-center gap-4 px-2 py-3 sm:px-4">
                <div
                  className={`flex size-9 shrink-0 items-center justify-center rounded-full text-label-sm font-semibold ${
                    MEDAL_STYLES[entry.rank] ?? 'bg-surface-tertiary text-on-surface-variant'
                  }`}
                >
                  {entry.rank}
                </div>
                <div className="min-w-0 flex-1 text-body-md text-on-surface">{entry.label}</div>
                <div className="shrink-0 text-body-md font-semibold text-primary">{entry.score} xal</div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
