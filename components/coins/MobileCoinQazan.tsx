import type { ReactNode } from 'react';
import MobileBottomTabBar from '@/components/home/MobileBottomTabBar';
import { CoinIcon, FlameIcon } from '@/components/icons';

export interface MobileCoinQazanProps {
  coinBalance: number;
  streakDays: number;
  longestStreak: number;
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

// Mobile-only shell for /coin-qazan.
//
// Structure and section order follow the Stitch mockup "Coin Qazan (Premium)"
// (project 9832560642768971810, screen 1d90afd2991d4339bc4ea8db000b1dcc):
// Virtual Qaraj hero → Daily Quests → Plate Market → Games → Leaderboard.
// Colours deliberately do NOT follow it — that export ships a generic mint
// palette; per the legaldrive-design skill it is a layout reference only, so
// everything below is on the app's own tokens.
//
// The mockup draws each earning mechanism as a thin decorative row. We mount
// the REAL card components instead (passed in as already-built elements from
// the page's server component, the same ones the desktop and 3D trees use) —
// those carry the live server-action wiring (ad-watch nonce flow, quiz answer
// submission, referral code) that a re-drawn row would have silently dropped.
//
// Shell conventions match MobileHome / MobileCoursePage / MobileChat: no
// <header> of its own (the global NavBar is the single mobile top bar), px-4
// sections, pb-24 to clear the fixed MobileBottomTabBar.
export default function MobileCoinQazan({
  coinBalance,
  streakDays,
  longestStreak,
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
    <div className="flex flex-col pb-24">
      {/* Mockup's eyebrow + gradient-headline lockup. */}
      <div className="px-4 pt-5">
        <span className="text-legal-citation uppercase tracking-widest text-primary">
          Virtual Qaraj
        </span>
        <h1 className="gradient-headline mt-1 text-display-lg text-[28px]">Coin Qazan</h1>
        <p className="mt-1.5 text-body-md text-on-surface-variant">
          Coin qazanmağın bütün yolları burada — gündəlik tapşırıqlar, oyunlar, dostlarını dəvət
          etmək və dərsləri tamamlamaq.
        </p>
      </div>

      {/* Two-tile bento, same shape as the mobile home dashboard so the screens
          read as one system. The mockup carries balance in its own top bar;
          ours lives in the global NavBar's CoinBadge, so the tiles show the
          numbers a user actually opens this page to check. */}
      <div className="grid grid-cols-2 gap-3 px-4 pt-4">
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <p className="text-label-sm text-on-surface-variant">Balans</p>
            <CoinIcon width={14} height={14} className="text-safety-yellow" />
          </div>
          <p className="mt-1 text-3xl font-extrabold text-safety-yellow">{coinBalance}</p>
          <p className="mt-2 text-legal-citation text-on-surface-variant">mövcud coin</p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <p className="text-label-sm text-on-surface-variant">Seriya</p>
            <FlameIcon
              width={14}
              height={14}
              className={
                streakDays > 0
                  ? 'streak-flame motion-reduce:animate-none text-caution-orange'
                  : 'text-on-surface-variant'
              }
            />
          </div>
          <p className="mt-1 text-3xl font-extrabold text-caution-orange">{streakDays} gün</p>
          <p className="mt-2 text-legal-citation text-on-surface-variant">
            Ən uzun: {longestStreak} gün
          </p>
        </div>
      </div>

      <section className="px-4 pt-6">
        <h2 className="mb-3 text-headline-md text-[18px]">Qarajım</h2>
        {garageCard}
      </section>

      <section className="px-4 pt-6">
        <h2 className="mb-3 text-headline-md text-[18px]">Gündəlik tapşırıqlar</h2>
        <div className="space-y-4">
          {dailyQuestCard}
          {dailyQuizCard}
          {adWatchCard}
          {referralCard}
        </div>
      </section>

      <section className="px-4 pt-6">
        <h2 className="mb-3 text-headline-md text-[18px]">Nömrə bazarı</h2>
        {plateMarketCard}
      </section>

      <section className="px-4 pt-6">
        <h2 className="mb-3 text-headline-md text-[18px]">Oyunlar</h2>
        <div className="space-y-4">
          {gamesSection}
          {wheelGame}
        </div>
      </section>

      <section className="px-4 pt-6">
        <h2 className="mb-3 text-headline-md text-[18px]">Həftəlik reytinq</h2>
        {weeklyLeaderboardCard}
      </section>

      <MobileBottomTabBar />
    </div>
  );
}
