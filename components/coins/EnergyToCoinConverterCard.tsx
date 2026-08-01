'use client';

import { useState, useTransition } from 'react';
import { Button, TextField, Input, toast } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { convertEnergyToCoinsAction } from '@/app/coin-qazan/actions';
import { formatCoin } from '@/components/coins/EnergyConverterCard';
import { CoinIcon, EnergyIcon } from '@/components/icons';
import AnimatedNumber from '@/components/AnimatedNumber';
import type { EnergyToCoinStatus } from '@/lib/coins/energyToCoin';

interface EnergyToCoinConverterCardProps {
  status: EnergyToCoinStatus;
  initialCoinBalance: number;
}

/**
 * "Enerji → Coin" — the ONE owner-sanctioned exception to the 0094 invariant
 * (energy NEVER otherwise converts back to coins). Rate/unit/daily cap come
 * from the server-provided status (app_settings with TS defaults); only the
 * energy amount is chosen client-side, and convert_energy_to_coins re-validates
 * it server-side. The daily cap decrement here is local display state only —
 * the ledger row is the authority.
 */
export default function EnergyToCoinConverterCard({
  status,
  initialCoinBalance,
}: EnergyToCoinConverterCardProps) {
  const [balance, setBalance] = useState(initialCoinBalance);
  const [energy, setEnergy] = useState(status.energyBalance);
  const [remainingToday, setRemainingToday] = useState(status.remainingToday);
  const [amountInput, setAmountInput] = useState('');
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ text: string; kind: 'success' | 'info' | 'error' } | null>(
    null,
  );

  const { available, config } = status;
  const amount = amountInput.trim() === '' ? 0 : Number(amountInput);
  const capReached = remainingToday <= 0;
  const amountValid =
    Number.isInteger(amount) &&
    amount >= 1 &&
    amount <= Math.min(energy, remainingToday);
  const canConvert = available && amountValid && !capReached && energy > 0;
  const preview = amount > 0 ? (amount / config.energyUnit) * config.coinRate : 0;

  function handleConvert() {
    if (!canConvert) return;
    startTransition(async () => {
      const result = await convertEnergyToCoinsAction(amount);
      if (result.status === 'success') {
        setBalance(result.coinBalance);
        setEnergy(result.energy);
        setRemainingToday((prev) => Math.max(0, prev - amount));
        setAmountInput('');
        setMessage(null);
        // App-wide contract CoinBadge (navbar) listens for this event; EnergyBadge
        // listens for the energy twin — this path DEBITS energy, so the badge
        // must drop too.
        window.dispatchEvent(
          new CustomEvent('coin-balance-update', { detail: { balance: result.coinBalance } }),
        );
        window.dispatchEvent(
          new CustomEvent('energy-balance-update', { detail: { balance: result.energy } }),
        );
        toast.success(`+${result.coinsCredited} coin`, {
          description: `${formatCoin(amount)} enerji coinə çevrildi`,
          indicator: <CoinIcon />,
        });
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
        <div className="flex size-10 items-center justify-center rounded-xl bg-safety-yellow/15 text-safety-yellow">
          <CoinIcon />
        </div>
        <div>
          <h2 className="text-headline-md text-[18px]">Enerji → Coin</h2>
          <p className="text-legal-citation text-on-surface-variant">Enerjini coini çevir</p>
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
        Məzənnə: {formatCoin(config.energyUnit)} enerji = {formatCoin(config.coinRate)} coin
      </p>
      <p className="text-legal-citation text-on-surface-variant">
        Bu gün çevrilə bilər: {remainingToday} enerji
      </p>

      {!available ? (
        <div className="rounded-xl border border-outline-variant/30 bg-outline-variant/10 px-4 py-3 text-body-md text-on-surface-variant">
          Bu funksiya hazırda əlçatan deyil
        </div>
      ) : capReached ? (
        <div className="rounded-xl border border-outline-variant/30 bg-outline-variant/10 px-4 py-3 text-body-md text-on-surface-variant">
          Bugünkü çevirmə limiti dolub
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <TextField
              type="number"
              value={amountInput}
              onChange={(v) => {
                setAmountInput(v);
                setMessage(null);
              }}
              aria-label="Enerji miqdarı"
            >
              <Input min={1} max={Math.min(energy, remainingToday)} step={1} />
            </TextField>

            {amount > 0 && (
              <p className="inline-flex items-center gap-1.5 text-body-md font-semibold text-on-surface">
                ~{formatCoin(preview)}
                <CoinIcon width={15} height={15} className="text-safety-yellow" />
                coin alırsan
              </p>
            )}
          </div>

          <Button
            variant="primary"
            className="glow-primary w-full gap-2"
            onPress={handleConvert}
            isDisabled={isPending || !canConvert}
            isPending={isPending}
          >
            {({ isPending: pending }) => (
              <>
                {pending ? <Spinner size="sm" tone="current" /> : <CoinIcon />}
                Çevir
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
