import Link from 'next/link';
import type { ReactNode } from 'react';
import MobileBottomTabBar from '@/components/home/MobileBottomTabBar';
import { CoinIcon, FlameIcon } from '@/components/icons';

export interface MobileCoinQazanProps {
  coinBalance: number;
  streakDays: number;
  longestStreak: number;
  dailyGrantCard: ReactNode;
  dailyQuestCard: ReactNode;
  dailyQuizCard: ReactNode;
  gamesSection: ReactNode;
  wheelGame: ReactNode;
  garageCard: ReactNode;
  plateMarketCard: ReactNode;
  referralCard: ReactNode;
  adWatchCard: ReactNode;
  weeklyLeaderboardCard: ReactNode;
}

/**
 * Section header in the Editorial idiom: a baseline-aligned title with a
 * hairline rule under it, and an optional action on the right. The rule is what
 * separates chapters on a page with no card borders to do that job.
 */
function SectionHeader({
  title,
  action,
}: {
  title: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-primary/10 pb-3">
      <h2 className="text-[22px] font-semibold leading-tight text-navy">{title}</h2>
      {action && (
        <Link
          href={action.href}
          className="shrink-0 text-[11px] font-bold uppercase tracking-[0.1em] text-primary transition hover:opacity-70"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}

/**
 * Mobile shell for /coin-qazan, rebuilt on the Stitch "Coin Qazan (Editorial)"
 * screen (project 9832560642768971810, screen d739e5cf6f264ffebcfcddcde2093986).
 *
 * Taken from the export: the full-bleed gradient balance slab that opens the
 * page, the hairline section headers, the generous 2rem/2.5rem radii and the
 * soft wide shadow.
 *
 * NOT taken from it: the task/leaderboard/plate cards it draws. Those are
 * decorative markup describing features this app implements for real —
 * DailyQuestCard owns the quest claim action, AdWatchCard owns the single-use
 * nonce flow, PlateMarketCard owns the purchase, WeeklyLeaderboardCard reads
 * real standings. Re-drawing them would have silently dropped that wiring, so
 * they are still mounted as-is, passed in from the page's server component —
 * the same elements the desktop and 3D trees mount.
 *
 * Its invented content is dropped outright: "+12.5% BU AY" (no month-over-month
 * metric exists), "95% Təhlükəsizlik Reytinqi" (no safety rating exists),
 * "50km Təhlükəsiz sür" (no odometer). Nothing here is a number the app cannot
 * actually produce.
 */
export default function MobileCoinQazan({
  coinBalance,
  streakDays,
  longestStreak,
  dailyGrantCard,
  dailyQuestCard,
  dailyQuizCard,
  gamesSection,
  wheelGame,
  garageCard,
  plateMarketCard,
  referralCard,
  adWatchCard,
  weeklyLeaderboardCard,
}: MobileCoinQazanProps) {
  return (
    <div className="editorial flex flex-col pb-24">
      <div className="space-y-12 px-5 pt-6">
        {/* Balance slab — the page's single focal point, at display scale. */}
        <section className="balance-slab editorial-shadow relative overflow-hidden rounded-[2rem] p-7">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-white/10 blur-3xl"
          />
          <div className="relative z-10">
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] opacity-70">
              Ümumi balans
            </span>
            <p className="editorial-display mt-2 text-[48px] font-bold leading-none tabular-nums">
              {coinBalance}
              <span className="ml-2 text-[20px] font-semibold opacity-60">coin</span>
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {streakDays > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] backdrop-blur-md">
                  <FlameIcon
                    width={13}
                    height={13}
                    className="streak-flame motion-reduce:animate-none"
                  />
                  {streakDays} gün seriya
                </span>
              )}
              {longestStreak > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.06em] opacity-80 backdrop-blur-md">
                  Rekord {longestStreak} gün
                </span>
              )}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/qiymetler"
                className="rounded-full bg-white px-6 py-3 text-[11px] font-bold uppercase tracking-[0.1em] text-primary transition active:scale-95"
              >
                Coin al
              </Link>
              <Link
                href="/leaderboard"
                className="rounded-full border border-white/30 px-6 py-3 text-[11px] font-bold uppercase tracking-[0.1em] transition hover:bg-white/10 active:scale-95"
              >
                Reytinq
              </Link>
            </div>
          </div>
        </section>

        <section>
          <SectionHeader title="Gündəlik tapşırıqlar" />
          <div className="space-y-4">
            {dailyGrantCard}
            {dailyQuestCard}
            {dailyQuizCard}
            {adWatchCard}
            {referralCard}
          </div>
        </section>

        <section>
          <SectionHeader title="Oyunlar" />
          <div className="space-y-4">
            {gamesSection}
            {wheelGame}
          </div>
        </section>

        <section>
          <SectionHeader title="Qarajım" action={{ label: 'Nömrə bazarı', href: '#nomre' }} />
          <div className="space-y-4">
            {garageCard}
            <div id="nomre">{plateMarketCard}</div>
          </div>
        </section>

        <section>
          <SectionHeader title="Həftəlik liderlər" action={{ label: 'Hamısı', href: '/leaderboard' }} />
          {weeklyLeaderboardCard}
        </section>

        <section>
          <Link
            href="/oyrenme"
            className="editorial-shadow flex items-center justify-between gap-4 rounded-[2rem] border border-border/40 bg-surface p-6 transition active:scale-[0.99]"
          >
            <span>
              <span className="block text-[11px] font-bold uppercase tracking-[0.1em] text-primary">
                Ən sabit yol
              </span>
              <span className="mt-1 block text-[18px] font-semibold text-navy">
                Dərsləri keç, coin qazan
              </span>
              <span className="mt-1 block text-[13px] text-on-surface-variant">
                Hər sualı ilk dəfə düzgün cavablandıranda coin gəlir.
              </span>
            </span>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <CoinIcon width={18} height={18} />
            </span>
          </Link>
        </section>
      </div>

      <MobileBottomTabBar />
    </div>
  );
}
