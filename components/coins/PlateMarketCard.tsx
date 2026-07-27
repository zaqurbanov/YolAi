'use client';

import { useState, useTransition } from 'react';
import { Button, TextField, Input } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { purchaseCustomPlateAction } from '@/app/coin-qazan/actions';
import { normalizePlateNumber } from '@/lib/garage/plateFormat';
import { CoinIcon } from '@/components/icons';

interface PlateMarketCardProps {
  plateNumber: string;
  isCustom: boolean;
  coinBalance: number;
  price: number;
}

// VIP Nömrə Bazarı (Virtual Qaraj Mərhələ 3) — same glass-card / useTransition
// / coin-balance-update event language as GarageCard.tsx, but independent of
// it: a plate needs no car. Client-side normalizePlateNumber() is a cheap
// early-feedback check only — purchaseCustomPlateAction re-validates and is
// the real authority (server resolves the price too, this never sends one).
export default function PlateMarketCard({ plateNumber, isCustom, coinBalance, price }: PlateMarketCardProps) {
  const [currentPlate, setCurrentPlate] = useState({ plateNumber, isCustom });
  const [balance, setBalance] = useState(coinBalance);
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const affordable = balance >= price;

  function handlePurchase() {
    setError(null);

    const normalized = normalizePlateNumber(inputValue);
    if (!normalized) {
      setError('Yanlış nömrə formatı (məs. 10-AA-001)');
      return;
    }
    if (currentPlate.isCustom) {
      setError('Artıq VIP nömrən var');
      return;
    }
    if (!affordable) {
      setError('Kifayət qədər coin yoxdur');
      return;
    }

    startTransition(async () => {
      const result = await purchaseCustomPlateAction(normalized);
      if (result.status === 'success' && result.plateNumber) {
        setCurrentPlate({ plateNumber: result.plateNumber, isCustom: true });
        setInputValue('');
        if (result.balance != null) {
          setBalance(result.balance);
          window.dispatchEvent(new CustomEvent('coin-balance-update', { detail: { balance: result.balance } }));
        }
        return;
      }

      setError(result.message);
    });
  }

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <span aria-hidden className="text-lg">🔢</span>
        </div>
        <h2 className="text-headline-md text-[18px]">VIP Nömrə Bazarı</h2>
      </div>

      <div
        className={
          'flex items-center gap-4 rounded-xl border p-4 ' +
          (currentPlate.isCustom
            ? 'border-safety-yellow/40 bg-safety-yellow/10'
            : 'border-outline-variant/30 bg-surface-container-high/40')
        }
      >
        <div className="min-w-0 flex-1">
          <p className="text-legal-citation text-on-surface-variant">Sənin nömrən</p>
          <p
            className={
              'text-headline-md tracking-wide ' +
              (currentPlate.isCustom ? 'text-[22px] text-safety-yellow' : 'text-[18px] text-on-surface')
            }
          >
            {currentPlate.plateNumber}
          </p>
        </div>
        {currentPlate.isCustom && (
          <span className="shrink-0 rounded-full bg-safety-yellow/15 px-2.5 py-1 text-legal-citation text-safety-yellow">
            VIP
          </span>
        )}
      </div>

      {currentPlate.isCustom ? (
        <p className="text-body-md text-on-surface-variant">
          Artıq VIP nömrən var. Hər istifadəçi yalnız bir VIP nömrə ala bilər.
        </p>
      ) : (
        <div className="space-y-2">
          <TextField
            value={inputValue}
            onChange={(v) => {
              setInputValue(v);
              if (error) setError(null);
            }}
            aria-label="İstədiyin nömrə"
          >
            <Input placeholder="İstədiyin nömrəni yaz, məs. 10-AA-001" />
          </TextField>

          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1 text-body-md text-on-surface-variant tabular-nums">
              <CoinIcon width={14} height={14} />
              {price}
            </span>
            <Button
              variant={affordable ? 'primary' : 'outline'}
              size="sm"
              isDisabled={inputValue.trim().length === 0}
              isPending={isPending}
              onPress={handlePurchase}
            >
              {({ isPending: pending }) => (
                <>
                  {pending ? <Spinner size="sm" tone="current" /> : null}
                  Al
                </>
              )}
            </Button>
          </div>

          {error && <p className="text-legal-citation text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
