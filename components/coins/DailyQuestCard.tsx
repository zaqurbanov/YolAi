'use client';

import { useState, useTransition } from 'react';
import { Button, Alert, toast } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import {
  claimDailyChestAction,
  claimDailyMissionAction,
  type DailyChestClaimState,
  type DailyMissionClaimState,
} from '@/app/coin-qazan/actions';
import { ChestIcon, EnergyIcon, CheckIcon, CoinIcon } from '@/components/icons';
import ChestOpenOverlay from '@/components/coins/ChestOpenOverlay';
import type { DailyQuestStatusResult } from '@/lib/coins/dailyQuests';

interface DailyQuestCardProps {
  status: DailyQuestStatusResult;
}

// Streak-strip cells — the marathon CYCLE day (index 0 = streak day 1 ..
// index 6 = streak day 7 = COINS), NOT weekday labels: day 1 is the first
// Baku day the user opens the chest, a missed day resets to day 1, and a
// completed day-7 cycle restarts at day 1 (0097_daily_quest_split.sql).
// Short labels ("G1".."G7") keep all 7 cells legible at phone width.
const STREAK_DAY_SHORT = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];

// Client component mirroring components/account/DailyQuizCard.tsx's pattern:
// direct server action call (the server re-verifies everything) + useTransition
// + the same coin-balance-update event contract CoinBadge listens for. Since
// 0097 the missions and the chest are SEPARATE: per-mission ENERGY claims
// (Section A) and a free, streak-scheduled chest (Section B) with NO mission
// gate.
export default function DailyQuestCard({ status }: DailyQuestCardProps) {
  const [result, setResult] = useState<DailyChestClaimState | null>(null);
  const [claimed, setClaimed] = useState(status.ok ? status.chestClaimed : false);
  const [isPending, startTransition] = useTransition();
  const [pendingMissionKey, setPendingMissionKey] = useState<string | null>(null);
  const [missionResult, setMissionResult] = useState<DailyMissionClaimState | null>(null);
  // Additive local claimed-state for missions. The server action calls
  // revalidatePath('/coin-qazan'), so the RSC refresh replays the `status`
  // prop as a SUPERSET after a claim (missions never un-claim). Seeded from
  // the initial prop, and each successful claim only ADDS a key — instant
  // feedback that never fights the refresh.
  const [localClaimedKeys, setLocalClaimedKeys] = useState<Set<string>>(
    () => new Set(status.ok ? status.missions.filter((m) => m.claimed).map((m) => m.key) : []),
  );
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealReward, setRevealReward] = useState(0);

  if (!status.ok) return null;

  const { missions, missionReward, marathon } = status;
  const { schedule, streak, todayClaimed } = marathon;

  // Streak-day index (0..6) of the user's CURRENT cycle day — mirrors the
  // RPC's v_streak_day = (consecutive_claimed_days % 7) + 1 mapping. When
  // today is already claimed, the just-claimed cell IS today's; otherwise the
  // next unclaimed one is. 0 prior days -> index 0; a full 7-day cycle wraps
  // to index 0 of the next cycle.
  const todayIndex = streak === 0 ? 0 : todayClaimed ? (streak - 1) % 7 : streak % 7;
  // How many cells render filled: capped at the full 7-cell cycle, so a
  // completed day-7 run shows all 7 filled rather than an empty strip.
  const filledCount = streak === 0 ? 0 : Math.min(streak, 7);

  function handleClaimChest() {
    startTransition(async () => {
      const state = await claimDailyChestAction();
      setResult(state);
      if (state.status === 'success') {
        setClaimed(true);
        // The chest pays per the streak-day marathon schedule (energy days 1-6,
        // coins on day 7); `balance` is the (unchanged-for-energy) coin balance,
        // forwarded only so the navbar badge re-syncs on a coin day.
        if (state.balance != null) {
          window.dispatchEvent(new CustomEvent('coin-balance-update', { detail: { balance: state.balance } }));
        }
        // Energy days: `energy` is the NEW energy balance; on a coin day it is
        // unchanged, so dispatching it is a harmless no-op for the badge.
        if (state.energy != null) {
          window.dispatchEvent(new CustomEvent('energy-balance-update', { detail: { balance: state.energy } }));
        }
        const rewardIsCoins = state.rewardType === 'coins';
        toast.success('Sandıq açıldı!', {
          description: rewardIsCoins ? `+${state.reward} coin qazandınız` : `+${state.reward} enerji qazandınız`,
          indicator: rewardIsCoins ? <CoinIcon /> : <EnergyIcon />,
        });
        setRevealReward(state.reward ?? 0);
        setRevealOpen(true);
      }
    });
  }

  function handleClaimMission(missionKey: string) {
    startTransition(async () => {
      setPendingMissionKey(missionKey);
      const state = await claimDailyMissionAction(missionKey);
      setMissionResult(state);
      if (state.status === 'success') {
        // Missions pay ENERGY — the coin balance is untouched, so NO
        // coin-balance-update dispatch here; the energy twin keeps the navbar
        // EnergyBadge live without waiting for the revalidatePath refresh.
        if (state.energy != null) {
          window.dispatchEvent(new CustomEvent('energy-balance-update', { detail: { balance: state.energy } }));
        }
        setLocalClaimedKeys((prev) => {
          const next = new Set(prev);
          next.add(missionKey);
          return next;
        });
        toast.success('Missiya tamamlandı!', {
          description: `+${state.reward} enerji qazandınız`,
          indicator: <EnergyIcon />,
        });
      }
      setPendingMissionKey(null);
    });
  }

  const cells = schedule.map((slot, i) => {
    const isFilled = i < filledCount;
    const isToday = i === todayIndex && !todayClaimed;
    const isCoinDay = i === 6;
    const classes = [
      'relative flex flex-col items-center gap-1 rounded-xl border px-0.5 py-2 text-center',
      isCoinDay
        ? 'border-caution-orange/40 bg-caution-orange/10 text-caution-orange'
        : 'border-outline-variant/30 text-on-surface-variant',
    ];
    if (isFilled) {
      classes.push(isCoinDay ? 'ring-1 ring-caution-orange/60' : 'border-go-green/30 bg-go-green/10 text-go-green');
    } else if (isToday) {
      // "today" / next-to-claim highlight — only when today is NOT yet
      // claimed (when it is, todayIndex is already inside filledCount).
      classes.push('border-primary bg-primary/10 text-primary ring-1 ring-primary/50');
    }
    return { slot, i, isFilled, isCoinDay, className: classes.join(' ') };
  });

  return (
    <div className="space-y-4">
      {/* SECTION A — Gündəlik Missiyalar (per-mission ENERGY claims) */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <EnergyIcon />
          </div>
          <div>
            <h2 className="text-headline-md text-[18px]">Gündəlik Missiyalar</h2>
            <p className="text-legal-citation text-on-surface-variant">Hər missiya +{missionReward} enerji verir</p>
          </div>
        </div>

        <ul className="space-y-2.5">
          {missions.map((mission) => {
            const isClaimed = localClaimedKeys.has(mission.key);
            const isMissionPending = pendingMissionKey === mission.key;
            return (
              <li key={mission.key} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div
                    className={
                      'flex size-6 shrink-0 items-center justify-center rounded-full ' +
                      (mission.done ? 'bg-go-green/15 text-go-green' : 'bg-outline-variant/20 text-on-surface-variant')
                    }
                  >
                    {mission.done ? <CheckIcon width={14} height={14} /> : <span className="size-1.5 rounded-full bg-current" />}
                  </div>
                  <div className="min-w-0">
                    <span className="block truncate text-body-md text-on-surface">{mission.label}</span>
                    {mission.progress && (
                      <span className="block text-legal-citation text-on-surface-variant">{mission.progress}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-legal-citation inline-flex items-center gap-1 rounded-full bg-caution-orange/15 px-2.5 py-1 text-caution-orange">
                    <EnergyIcon width={14} height={14} />
                    +{missionReward} enerji
                  </span>
                  {isClaimed ? (
                    <span className="text-legal-citation inline-flex items-center gap-1 text-on-surface-variant">
                      <CheckIcon width={12} height={12} />
                      Alındı
                    </span>
                  ) : mission.done ? (
                    <Button
                      size="sm"
                      variant="primary"
                      isPending={isMissionPending}
                      onPress={() => handleClaimMission(mission.key)}
                    >
                      {({ isPending: pending }) => (pending ? <Spinner size="sm" tone="current" /> : 'Götür')}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>

        {missionResult && missionResult.status !== 'success' && (
          <Alert status={missionResult.status === 'error' ? 'danger' : 'warning'}>
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{missionResult.message}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
      </div>

      {/* SECTION B — Həftəlik Marafon (free, streak-scheduled chest) */}
      <div className="glass-card rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-caution-orange/15 text-caution-orange">
            <ChestIcon />
          </div>
          <div>
            <h2 className="text-headline-md text-[18px]">Həftəlik Marafon</h2>
            <p className="text-legal-citation text-on-surface-variant">7 gün aç — 7-ci gündə coin qazan</p>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {cells.map(({ slot, i, isFilled, isCoinDay, className }) => (
            <div key={i} className={className}>
              {isFilled && (
                <span className="absolute right-1 top-1 flex items-center justify-center text-go-green">
                  <CheckIcon width={10} height={10} />
                </span>
              )}
              <span className="text-[10px] font-medium leading-none">{STREAK_DAY_SHORT[i]}</span>
              <span className="flex items-center gap-0.5 text-xs font-semibold leading-none">
                +{slot.amount}
                {slot.type === 'coins' ? (
                  <CoinIcon width={10} height={10} />
                ) : (
                  <EnergyIcon width={10} height={10} />
                )}
              </span>
            </div>
          ))}
        </div>

        {result && result.status !== 'success' && (
          <Alert status={result.status === 'error' ? 'danger' : 'warning'}>
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{result.message}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {claimed ? (
          <div className="flex items-center gap-2 rounded-xl border border-outline-variant/30 bg-go-green/5 px-4 py-3 text-body-md text-go-green">
            <CheckIcon width={16} height={16} />
            Bugünkü sandıq açılıb
          </div>
        ) : (
          <Button variant="primary" className="glow-primary gap-2" onPress={handleClaimChest} isPending={isPending}>
            {({ isPending: pending }) => (
              <>
                {pending ? <Spinner size="sm" tone="current" /> : <ChestIcon />}
                Sandığı aç
              </>
            )}
          </Button>
        )}

        <ChestOpenOverlay
          open={revealOpen}
          reward={revealReward}
          rewardType={result?.rewardType}
          onClose={() => setRevealOpen(false)}
        />
      </div>
    </div>
  );
}
