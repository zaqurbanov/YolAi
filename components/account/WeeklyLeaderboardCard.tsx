import { TrophyIcon, FineIcon } from '@/components/icons';
import type { WeeklyLeaderboard } from '@/lib/coins/leaderboard';

interface WeeklyLeaderboardCardProps {
  leaderboard: WeeklyLeaderboard;
}

// Top-3 get a tinted rank badge in the page's existing traffic-accent family
// (gold=safety-yellow, silver=on-surface-variant, bronze=caution-orange);
// ranks 4+ get a plain muted number. No new palette introduced.
function rankBadgeClasses(rank: number): string {
  if (rank === 1) return 'bg-safety-yellow/15 text-safety-yellow';
  if (rank === 2) return 'bg-on-surface-variant/15 text-on-surface-variant';
  if (rank === 3) return 'bg-caution-orange/15 text-caution-orange';
  return 'bg-outline-variant/20 text-on-surface-variant';
}

// Static display, no interactivity — server component. Consumes the finished
// getWeeklyLeaderboard contract; an empty `top` is the normal "no data yet"
// state (the read layer fails open), so it renders an empty state, never a
// broken frame.
export default function WeeklyLeaderboardCard({ leaderboard }: WeeklyLeaderboardCardProps) {
  const { top, me } = leaderboard;
  const meInTop = top.some((entry) => entry.isMe);

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4 lg:col-span-2">
      <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <TrophyIcon />
        </div>
        <div>
          <h2 className="text-headline-md text-[18px]">Həftəlik reytinq</h2>
          <p className="text-body-md text-on-surface-variant">
            Bu həftə ən çox düzgün cavab verənlər
          </p>
        </div>
      </div>

      {top.length === 0 ? (
        <p className="text-body-md text-on-surface-variant">Bu həftə hələ reytinq yoxdur</p>
      ) : (
        <ul className="space-y-2">
          {top.map((entry, index) => (
            <li
              key={entry.rank}
              style={{ animationDelay: `${index * 60}ms` }}
              className={
                'leaderboard-row-in motion-reduce:animate-none flex items-center gap-3 rounded-xl px-3 py-2.5 ' +
                (entry.isMe
                  ? 'border border-primary/40 bg-primary/10'
                  : 'border border-transparent')
              }
            >
              <span
                className={
                  'flex size-8 shrink-0 items-center justify-center rounded-lg text-legal-citation ' +
                  rankBadgeClasses(entry.rank)
                }
              >
                {entry.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-body-md font-medium text-on-surface">
                {entry.carEmoji && <span className="mr-1">{entry.carEmoji}</span>}
                {entry.isFined && (
                  <span
                    title="Cəriməli"
                    className="mr-1 inline-flex items-center gap-0.5 rounded-md bg-danger/15 px-1 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-danger"
                  >
                    <FineIcon width={10} height={10} />
                    Cərimə
                  </span>
                )}
                {entry.name}
                {entry.plateNumber && (
                  <span
                    className={
                      'ml-2 text-legal-citation rounded-md border px-1.5 py-0.5 align-middle tracking-wide ' +
                      (entry.isCustomPlate
                        ? 'border-safety-yellow/40 bg-safety-yellow/15 text-safety-yellow'
                        : 'border-outline-variant/30 bg-outline-variant/10 text-on-surface-variant')
                    }
                  >
                    {entry.plateNumber}
                  </span>
                )}
                {entry.isMe && (
                  <span className="ml-2 text-legal-citation rounded-full bg-primary/15 px-2 py-0.5 align-middle text-primary">
                    sən
                  </span>
                )}
              </span>
              <span className="shrink-0 text-body-md text-on-surface-variant">
                {entry.points} düzgün cavab
              </span>
            </li>
          ))}

          {/* Caller ranks outside the top 10: append a visually separated row so
              they always see where they stand. */}
          {!meInTop && me && (
            <li
              style={{ animationDelay: `${top.length * 60}ms` }}
              className="leaderboard-row-in motion-reduce:animate-none mt-3 flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/10 px-3 py-2.5"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-legal-citation text-primary">
                #{me.rank}
              </span>
              <span className="min-w-0 flex-1 truncate text-body-md font-medium text-on-surface">
                Sən
              </span>
              <span className="shrink-0 text-body-md text-on-surface-variant">
                {me.points} düzgün cavab
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
