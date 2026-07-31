import Link from 'next/link';
import type { ReactNode } from 'react';
import RoadShaderBackground from '@/components/design3d/RoadShaderBackground';
import { ArrowLeftIcon, CoinIcon, FlameIcon } from '@/components/icons';

interface CoinQazanPage3DProps {
  coinBalance: number;
  streakDays: number;
  dailyQuestCard: ReactNode;
  weeklyLeaderboardCard: ReactNode;
  garageCard: ReactNode;
  plateMarketCard: ReactNode;
  dailyQuizCard: ReactNode;
  referralCard: ReactNode;
  adWatchCard: ReactNode;
  gamesSection: ReactNode;
  wheelGame: ReactNode;
}

// Same pattern as HomePage3D: the server component (app/coin-qazan/page.tsx)
// fetches all real data/server actions and renders every existing card
// (GarageCard, PlateMarketCard, DailyQuestCard, GamesSection, WheelGame,
// DailyQuizCard, AdWatchCard, ReferralCard, WeeklyLeaderboardCard) exactly as
// it already does for the "sadə dizayn" tree — those trees are passed down
// here as already-rendered `ReactNode` props and mounted UNCHANGED. This
// component only supplies the surrounding "Cyber-Circuit Legal" HUD frame
// (backdrop, header, per-card neon border wrapper) — it never re-implements
// a card's internal render logic, so every server action / HeroUI
// integration inside those cards stays exactly as it was.
const HUD_FRAMES: { key: keyof Omit<CoinQazanPage3DProps, 'coinBalance' | 'streakDays'>; label: string; span?: string }[] = [
  { key: 'dailyQuestCard', label: 'GÜNDƏLİK MİSSİYA' },
  { key: 'weeklyLeaderboardCard', label: 'HƏFTƏLİK REYTİNQ' },
  { key: 'garageCard', label: 'VİRTUAL QARAJ' },
  { key: 'plateMarketCard', label: 'VIP NÖMRƏ BAZARI' },
  { key: 'dailyQuizCard', label: 'BUGÜNKÜ SUAL' },
  { key: 'referralCard', label: 'DOST DƏVƏTİ' },
  { key: 'adWatchCard', label: 'REKLAM İZLƏ' },
  // Full row width — the games terminal (XO/Nişan Sürəti/Sınaq İmtahanı tabs)
  // needs more horizontal room than the half-width grid cell gives it.
  { key: 'gamesSection', label: 'OYUNLAR TERMİNALI', span: 'lg:col-span-2' },
  { key: 'wheelGame', label: 'ÇARX' },
];

function HudFrame({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div
      className={`hud-glass relative flex flex-col gap-3 overflow-hidden rounded-2xl border-l-4 p-1 sm:p-1.5 ${className ?? ''}`}
      style={{ borderColor: 'var(--hud-primary)' }}
    >
      <div
        className="flex items-center gap-2 px-4 pt-3"
        style={{ fontFamily: 'var(--hud-font-mono)' }}
      >
        <span className="size-1.5 rounded-full" style={{ background: 'var(--hud-primary)' }} />
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--hud-primary)' }}>
          {label}
        </span>
      </div>
      {/* Inner cards (GarageCard, WheelGame, DailyQuestCard, ...) are mounted
          unchanged and still carry their own "sadə dizayn" `glass-card`/
          `glass-panel` classes — `coinqazan-hud-cards` scopes a HUD repaint
          onto those existing classes (same technique as `.chat-hud-shell
          .glass-panel` / `.oyrenme-hud-courses .glass-card`) instead of
          forking each card into a second JSX tree. See app/globals.css. */}
      <div className="coinqazan-hud-cards px-1 pb-1 sm:px-1.5 sm:pb-1.5">{children}</div>
    </div>
  );
}

export default function CoinQazanPage3D({
  coinBalance,
  streakDays,
  dailyQuestCard,
  weeklyLeaderboardCard,
  garageCard,
  plateMarketCard,
  dailyQuizCard,
  referralCard,
  adWatchCard,
  gamesSection,
  wheelGame,
}: CoinQazanPage3DProps) {
  const cards: Record<string, ReactNode> = {
    dailyQuestCard,
    weeklyLeaderboardCard,
    garageCard,
    plateMarketCard,
    dailyQuizCard,
    referralCard,
    adWatchCard,
    gamesSection,
    wheelGame,
  };

  return (
    <div
      className="relative flex flex-1 flex-col px-4 pt-8 pb-16 md:px-8"
      style={{ color: 'var(--hud-on-surface)', fontFamily: 'var(--hud-font-body)' }}
    >
      {/* Same fixed shader backdrop + legibility veil as HomePage3D — see that
          file for the reasoning on `position: fixed` and the 45% veil mix. */}
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--hud-bg-deep)' }} aria-hidden="true">
        <RoadShaderBackground className="absolute inset-0 h-full w-full" />
      </div>
      <div
        className="fixed inset-0 -z-10"
        style={{ background: 'color-mix(in oklab, var(--hud-bg-deep) 55%, transparent)' }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-6">
        {/* ---------- Header ---------- */}
        <div className="flex flex-col gap-6 border-b pb-6 md:flex-row md:items-end md:justify-between" style={{ borderColor: 'var(--hud-border)' }}>
          <div>
            <Link
              href="/account"
              className="mb-4 inline-flex items-center gap-1.5 text-sm"
              style={{ color: 'var(--hud-on-surface-variant)' }}
            >
              <ArrowLeftIcon width={14} height={14} />
              Hesaba qayıt
            </Link>
            <div className="mb-2 flex items-center gap-3">
              <CoinIcon
                width={26}
                height={26}
                style={{ color: 'var(--hud-primary)', filter: 'drop-shadow(0 0 8px var(--hud-glow-primary))' }}
              />
              <h1 className="text-2xl font-bold md:text-3xl" style={{ fontFamily: 'var(--hud-font-display)' }}>
                Coin Qazan
              </h1>
            </div>
            <p className="max-w-xl text-sm" style={{ color: 'var(--hud-on-surface-variant)' }}>
              Coin qazanmağın bütün yolları burada toplanıb — gündəlik sual, dostlarını dəvət etmək,
              reklam izləmək və dərsləri tamamlamaq.
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div
              className="hud-glass flex min-w-[180px] items-center gap-4 rounded-xl border-l-4 p-4"
              style={{ borderColor: 'var(--hud-primary)' }}
            >
              <div className="flex-1">
                <p
                  className="mb-1 text-[11px] font-bold uppercase tracking-widest"
                  style={{ fontFamily: 'var(--hud-font-mono)', color: 'var(--hud-on-surface-variant)' }}
                >
                  Cari Balans
                </p>
                <div className="flex items-baseline gap-1">
                  <span
                    className="text-2xl font-extrabold"
                    style={{ color: 'var(--hud-primary)', textShadow: '0 0 10px var(--hud-glow-primary)' }}
                  >
                    {coinBalance.toLocaleString('az-AZ')}
                  </span>
                  <span className="text-xs font-bold" style={{ color: 'var(--hud-primary)' }}>
                    coin
                  </span>
                </div>
              </div>
              <CoinIcon width={28} height={28} style={{ color: 'var(--hud-primary)', opacity: 0.8 }} />
            </div>

            {streakDays > 0 && (
              <div
                className="hud-glass flex flex-col items-center gap-1 rounded-xl border-l-4 p-4"
                style={{ borderColor: 'var(--hud-red)' }}
              >
                <FlameIcon width={22} height={22} style={{ color: 'var(--hud-red)' }} />
                <span className="text-lg font-extrabold" style={{ color: 'var(--hud-red)' }}>
                  {streakDays}
                </span>
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{ fontFamily: 'var(--hud-font-mono)', color: 'var(--hud-on-surface-variant)' }}
                >
                  gün
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ---------- HUD-framed card grid ---------- */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {HUD_FRAMES.map(({ key, label, span }) => (
            <HudFrame key={key} label={label} className={span}>
              {cards[key]}
            </HudFrame>
          ))}
        </div>

      </div>
    </div>
  );
}
