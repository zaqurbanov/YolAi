'use client';

import { useState, useTransition } from 'react';
import { Button, Alert, toast } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { claimDailyChestAction, type DailyChestClaimState } from '@/app/coin-qazan/actions';
import { CoinIcon, CheckIcon } from '@/components/icons';
import ChestOpenOverlay from '@/components/coins/ChestOpenOverlay';
import type { DailyQuestStatusResult } from '@/lib/coins/dailyQuests';

interface DailyQuestCardProps {
  status: DailyQuestStatusResult;
}

// Client component mirroring components/account/DailyQuizCard.tsx's pattern:
// direct server action call (no args, server re-verifies everything) +
// useTransition + the same coin-balance-update event contract CoinBadge listens for.
export default function DailyQuestCard({ status }: DailyQuestCardProps) {
  const [result, setResult] = useState<DailyChestClaimState | null>(null);
  const [claimed, setClaimed] = useState(status.ok ? status.chestClaimed : false);
  const [isPending, startTransition] = useTransition();
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealReward, setRevealReward] = useState(0);

  if (!status.ok) return null;

  const { missions, allDone } = status;

  function handleClaim() {
    startTransition(async () => {
      const state = await claimDailyChestAction();
      setResult(state);
      if (state.status === 'success') {
        setClaimed(true);
        if (state.balance != null) {
          window.dispatchEvent(new CustomEvent('coin-balance-update', { detail: { balance: state.balance } }));
        }
        toast.success('Sandıq açıldı!', {
          description: `+${state.reward} coin qazandınız`,
          indicator: <CoinIcon />,
        });
        setRevealReward(state.reward ?? 0);
        setRevealOpen(true);
      }
    });
  }

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-safety-yellow/15 text-safety-yellow">
          <CoinIcon />
        </div>
        <h2 className="text-headline-md text-[18px]">Gündəlik Missiyalar</h2>
      </div>

      <ul className="space-y-2.5">
        {missions.map((mission) => (
          <li key={mission.key} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div
                className={
                  'flex size-6 shrink-0 items-center justify-center rounded-full ' +
                  (mission.done ? 'bg-go-green/15 text-go-green' : 'bg-outline-variant/20 text-on-surface-variant')
                }
              >
                {mission.done ? <CheckIcon width={14} height={14} /> : <span className="size-1.5 rounded-full bg-current" />}
              </div>
              <span className="text-body-md text-on-surface">{mission.label}</span>
            </div>
            {mission.progress && (
              <span className="text-legal-citation text-on-surface-variant">{mission.progress}</span>
            )}
          </li>
        ))}
      </ul>

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
        <Button
          variant="primary"
          className={allDone ? 'glow-primary gap-2' : 'gap-2'}
          onPress={handleClaim}
          isDisabled={!allDone}
          isPending={isPending}
        >
          {({ isPending: pending }) => (
            <>
              {pending ? <Spinner size="sm" tone="current" /> : <CoinIcon />}
              Günün Sandığını Aç
            </>
          )}
        </Button>
      )}

      <ChestOpenOverlay open={revealOpen} reward={revealReward} onClose={() => setRevealOpen(false)} />
    </div>
  );
}
