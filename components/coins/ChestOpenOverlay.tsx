'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@heroui/react';
import AnimatedNumber from '@/components/AnimatedNumber';
import { ChestIcon, ChestOpenIcon, CoinIcon } from '@/components/icons';

interface ChestOpenOverlayProps {
  reward: number;
  open: boolean;
  onClose: () => void;
}

const AUTO_CLOSE_MS = 3000;
const COIN_BURST_COUNT = 6;

// Full-screen celebratory reveal shown after DailyQuestCard's claim succeeds.
// Purely presentational — the reward/balance are already authoritative from
// the server action response by the time this mounts, this just animates it.
// Auto-dismisses after AUTO_CLOSE_MS unless the user closes it first; the
// timer is always cleared on close/unmount so there's no setState-after-unmount.
export default function ChestOpenOverlay({ reward, open, onClose }: ChestOpenOverlayProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    timerRef.current = setTimeout(onClose, AUTO_CLOSE_MS);
    return () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-md">
      <div className="glass-panel relative flex w-full max-w-sm flex-col items-center gap-6 rounded-3xl p-8 text-center">
        <div className="relative flex h-28 w-28 items-center justify-center">
          <div className="pointer-events-none absolute inset-0">
            {Array.from({ length: COIN_BURST_COUNT }).map((_, i) => (
              <span
                key={i}
                className="chest-coin-burst motion-reduce:animate-none absolute left-1/2 top-1/2 text-safety-yellow"
              >
                <CoinIcon width={16} height={16} />
              </span>
            ))}
          </div>

          <div className="chest-shake-open motion-reduce:animate-none relative flex h-20 w-20 items-center justify-center text-safety-yellow">
            <span className="chest-lid-hide motion-reduce:animate-none absolute inset-0 flex items-center justify-center">
              <ChestIcon width={56} height={56} />
            </span>
            <span className="chest-lid-reveal motion-reduce:animate-none absolute inset-0 flex items-center justify-center">
              <ChestOpenIcon width={56} height={56} />
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-headline-md text-on-surface">Sandıq açıldı!</p>
          <p className="flex items-center justify-center gap-1.5 text-display-lg text-safety-yellow">
            <span>+</span>
            <AnimatedNumber value={reward} durationMs={900} />
            <CoinIcon width={22} height={22} />
          </p>
        </div>

        <Button variant="primary" className="glow-primary w-full" onPress={onClose}>
          Davam et
        </Button>
      </div>
    </div>
  );
}
