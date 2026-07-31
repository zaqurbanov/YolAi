'use client';

import { useState, useTransition } from 'react';
import { Button, Alert } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { claimDailyGrantAction, type DailyGrantClaimState } from '@/app/coin-qazan/actions';
import { CoinIcon, EnergyIcon, CheckIcon, GiftIcon } from '@/components/icons';
import type { DailyGrantStatus } from '@/lib/coins/dailyGrant';

interface DailyGrantCardProps {
  status: DailyGrantStatus;
}

/**
 * "Günlük hədiyyə" — the once-per-Baku-day grant of a few COINS plus the day's
 * ENERGY top-up (0094_two_currency_economy.sql). Mirrors DailyQuestCard's
 * pattern exactly: a no-argument server action, useTransition, and the same
 * `coin-balance-update` event contract CoinBadge listens for.
 *
 * The two currencies are shown as two separate chips, never summed — they are
 * not interchangeable, and energy can never be converted back into coins.
 */
export default function DailyGrantCard({ status }: DailyGrantCardProps) {
  const [result, setResult] = useState<DailyGrantClaimState | null>(null);
  const [claimed, setClaimed] = useState(status.claimed);
  const [isPending, startTransition] = useTransition();

  // After a claim, report what was ACTUALLY credited rather than what the card
  // advertised: energyGranted is legitimately 0 when the lazy daily top-up
  // already fired (e.g. the user opened the games page first), and promising
  // energy that never arrived is exactly the kind of lie this card must avoid.
  const grantedCoins = result?.status === 'success' ? (result.coins ?? 0) : status.coins;
  const grantedEnergy = result?.status === 'success' ? (result.energyGranted ?? 0) : status.energy;

  function handleClaim() {
    startTransition(async () => {
      const state = await claimDailyGrantAction();
      setResult(state);
      if (state.status === 'success') {
        setClaimed(true);
        if (state.balance != null) {
          window.dispatchEvent(
            new CustomEvent('coin-balance-update', { detail: { balance: state.balance } }),
          );
        }
      }
      if (state.status === 'already_claimed') setClaimed(true);
    });
  }

  return (
    <div className="glass-card space-y-4 rounded-2xl p-6">
      <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <GiftIcon />
        </div>
        <div>
          <h2 className="text-headline-md text-[18px]">Günlük hədiyyə</h2>
          <p className="text-legal-citation text-on-surface-variant">Gündə bir dəfə</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-legal-citation inline-flex items-center gap-1.5 rounded-full bg-safety-yellow/15 px-3 py-1.5 text-safety-yellow">
          <CoinIcon width={14} height={14} />+{grantedCoins} coin
        </span>
        {grantedEnergy > 0 && (
          <span className="text-legal-citation inline-flex items-center gap-1.5 rounded-full bg-caution-orange/15 px-3 py-1.5 text-caution-orange">
            <EnergyIcon width={14} height={14} />+{grantedEnergy} enerji
          </span>
        )}
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
          {result?.status === 'success' ? result.message : 'Bugünkü hədiyyə alınıb'}
        </div>
      ) : (
        <Button
          variant="primary"
          className="glow-primary gap-2"
          onPress={handleClaim}
          isPending={isPending}
        >
          {({ isPending: pending }) => (
            <>
              {pending ? <Spinner size="sm" tone="current" /> : <GiftIcon />}
              Hədiyyəni al
            </>
          )}
        </Button>
      )}
    </div>
  );
}
