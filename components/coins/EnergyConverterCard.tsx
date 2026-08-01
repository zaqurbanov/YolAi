'use client';

import { useState, useTransition } from 'react';
import { Button } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { purchaseEnergyAction } from '@/app/coin-qazan/actions';
import { CoinIcon, EnergyIcon } from '@/components/icons';
import AnimatedNumber from '@/components/AnimatedNumber';

export interface EnergyConverterCardProps {
  /** Current coin balance. */
  initialBalance: number;
  /** Current energy balance. */
  initialEnergy: number;
  /** Daily-grant scale — the meter denominator (energyStatus.max). */
  maxEnergy: number;
  /** Purchase cap (energy_purchase_max_balance). */
  maxBalance: number;
  /** Base package coin price (energy_purchase_coin_cost, may be fractional). */
  coinCost: number;
  /** Base package energy grant (energy_purchase_energy_amount). */
  energyAmount: number;
  /** Max purchase multiple (energy_purchase_max_multiplier). */
  maxMultiplier: number;
}

// The disable rule for a multiplier preset, shared by EnergyConverterCard and
// GamePageShell's compact converter so the two surfaces can never drift apart.
// purchase_energy runs grant_daily_energy first (top-up to the daily floor),
// so the cap check effectively starts from at least the daily grant:
// effectiveEnergy = max(energy, maxEnergy). If the real balance is already
// above the floor it exceeds that estimate, which is the safe direction.
export function isEnergyPresetDisabled(
  m: number,
  opts: {
    energy: number;
    maxEnergy: number;
    maxBalance: number;
    balance: number;
    coinCost: number;
    energyAmount: number;
  },
): boolean {
  const effectiveEnergy = Math.max(opts.energy, opts.maxEnergy);
  return (
    effectiveEnergy + opts.energyAmount * m > opts.maxBalance || opts.balance < opts.coinCost * m
  );
}

// App_settings prices may be fractional; coin balances are always integers.
export function formatCoin(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/\.?0+$/, '');
}

/**
 * "Enerji Konvertor" — coin → energy (a coin SINK; energy never converts back).
 * Quantity-selective: the multiplier is chosen client-side but re-clamped
 * server-side inside purchaseEnergyAction, so no amount is ever client-trusted.
 * All economy numbers arrive as props from getEnergyPurchaseConfig() (app_settings
 * with TS defaults); nothing here is hardcoded.
 */
export default function EnergyConverterCard({
  initialBalance,
  initialEnergy,
  maxEnergy,
  maxBalance,
  coinCost,
  energyAmount,
  maxMultiplier,
}: EnergyConverterCardProps) {
  const [balance, setBalance] = useState(initialBalance);
  const [energy, setEnergy] = useState(initialEnergy);
  const [multiplier, setMultiplier] = useState(1);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; kind: 'success' | 'info' | 'error' } | null>(
    null,
  );

  // Server clamps the multiplier to floor(maxMultiplier), so the client presets
  // mirror that floor.
  const presets = Array.from({ length: Math.max(1, Math.floor(maxMultiplier)) }, (_, i) => i + 1);
  const atMax = energy >= maxBalance;
  const selectedDisabled = isEnergyPresetDisabled(multiplier, {
    energy,
    maxEnergy,
    maxBalance,
    balance,
    coinCost,
    energyAmount,
  });

  function handleSelect(m: number) {
    setMultiplier(m);
    setMessage(null);
  }

  function handleConvert() {
    startTransition(async () => {
      const result = await purchaseEnergyAction(multiplier);
      if (result.status === 'success' && result.coinBalance != null && result.energy != null) {
        setBalance(result.coinBalance);
        setEnergy(result.energy);
        // App-wide contract CoinBadge (navbar) listens for this event; EnergyBadge
        // listens for the energy twin so both navbar badges stay live.
        window.dispatchEvent(
          new CustomEvent('coin-balance-update', { detail: { balance: result.coinBalance } }),
        );
        window.dispatchEvent(
          new CustomEvent('energy-balance-update', { detail: { balance: result.energy } }),
        );
        setMultiplier(1);
        setMessage({ text: result.message, kind: 'success' });
      } else {
        setMessage({
          text: result.message,
          kind: result.status === 'error' ? 'error' : 'info',
        });
      }
    });
  }

  return (
    <div className="glass-card space-y-4 rounded-2xl p-6">
      <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <EnergyIcon />
        </div>
        <div>
          <h2 className="text-headline-md text-[18px]">Enerji Konvertor</h2>
          <p className="text-legal-citation text-on-surface-variant">Coini enerjiyə çevir</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-legal-citation inline-flex items-center gap-1.5 rounded-full bg-safety-yellow/15 px-3 py-1.5 text-safety-yellow">
          <CoinIcon width={14} height={14} />
          <AnimatedNumber value={balance} className="font-semibold tabular-nums" />
          coin
        </span>
        <span className="text-legal-citation inline-flex items-center gap-1.5 rounded-full bg-caution-orange/15 px-3 py-1.5 text-caution-orange">
          <EnergyIcon width={14} height={14} />
          <span className="font-semibold tabular-nums">{energy}</span>
          enerji
        </span>
      </div>

      <p className="mono-label text-on-surface-variant">
        Məzənnə: {formatCoin(coinCost)} coin → {formatCoin(energyAmount)} enerji
      </p>

      {atMax ? (
        <div className="rounded-xl border border-outline-variant/30 bg-outline-variant/10 px-4 py-3 text-body-md text-on-surface-variant">
          Maksimum enerjiyə çatmısan
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {presets.map((m) => {
              const disabled = isEnergyPresetDisabled(m, {
                energy,
                maxEnergy,
                maxBalance,
                balance,
                coinCost,
                energyAmount,
              });
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleSelect(m)}
                  disabled={disabled}
                  aria-pressed={multiplier === m}
                  className={
                    'rounded-full border px-3.5 py-1.5 text-body-md font-semibold tabular-nums transition ' +
                    (multiplier === m
                      ? 'border-primary/40 bg-primary/15 text-primary'
                      : 'border-outline-variant/30 text-on-surface-variant hover:bg-primary/5')
                  }
                >
                  {m}×
                </button>
              );
            })}
          </div>

          <p className="inline-flex items-center gap-1.5 text-body-md font-semibold text-on-surface">
            <span className="tabular-nums">
              {multiplier}× = {formatCoin(coinCost * multiplier)}
            </span>
            <CoinIcon width={15} height={15} className="text-safety-yellow" />
            <span aria-hidden>→</span>
            <span className="tabular-nums">{formatCoin(energyAmount * multiplier)}</span>
            <EnergyIcon width={15} height={15} className="text-caution-orange" />
          </p>

          <Button
            variant="primary"
            className="glow-primary w-full gap-2"
            onPress={handleConvert}
            isDisabled={isPending || selectedDisabled}
            isPending={isPending}
          >
            {({ isPending: pending }) => (
              <>
                {pending ? <Spinner size="sm" tone="current" /> : <EnergyIcon />}
                Enerji al
              </>
            )}
          </Button>
        </>
      )}

      {message && (
        <p
          className={
            'text-body-md ' +
            (message.kind === 'success'
              ? 'text-go-green'
              : message.kind === 'error'
                ? 'text-danger'
                : 'text-on-surface-variant')
          }
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
