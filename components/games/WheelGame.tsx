'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { CoinIcon } from '@/components/icons';
import { useResetCountdown } from '@/components/useResetCountdown';
import { spinWheelAction } from '@/app/coin-qazan/actions';
import type { WheelPrize } from '@/lib/coins/wheel';

interface WheelGameProps {
  prizes: WheelPrize[];
  initialStatus: 'available' | 'spun' | 'unavailable';
}

// Two brand tones alternating around the wheel. Kept token-based so it tracks
// the theme (light/dark) like the rest of the HUD.
const SEG_COLORS = ['var(--color-primary)', 'var(--color-regulatory-blue)'];

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Formats a weight percentage tersely: strips a trailing ".0" but keeps
// meaningful decimals (e.g. 12.5 stays, 5.0 becomes "5").
function formatWeight(weight: number): string {
  return weight % 1 === 0 ? String(weight) : String(Math.round(weight * 100) / 100);
}

// Each segment's start/end angle, proportional to its weight (not equal
// slices) — weights sum to 100 by contract, so this always closes a full
// circle. Shared by the conic-gradient stops, the label rotations and the
// pointer-landing math below, so they never disagree with each other.
function buildSegmentAngles(prizes: WheelPrize[]): { start: number; end: number; centre: number }[] {
  let cursor = 0;
  return prizes.map((p) => {
    const angle = (p.weight / 100) * 360;
    const start = cursor;
    const end = cursor + angle;
    cursor = end;
    return { start, end, centre: start + angle / 2 };
  });
}

// The daily free prize wheel. The SERVER decides the winning segment (crypto
// RNG) and returns its index; this only animates the wheel to that index and
// shows the server's prize. It never picks or computes a prize.
export default function WheelGame({ prizes, initialStatus }: WheelGameProps) {
  const [status, setStatus] = useState(initialStatus);
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [wonPrize, setWonPrize] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const turnsRef = useRef(0);
  // Live countdown to the next Baku 00:00 (when the daily free spin resets),
  // shown only once the spin has been used.
  const respinCountdown = useResetCountdown(status === 'spun');

  const segments = useMemo(() => buildSegmentAngles(prizes), [prizes]);

  // Static conic-gradient of the coloured segments (the wheel graphic itself).
  const background = useMemo(() => {
    const stops = segments
      .map((seg, i) => `${SEG_COLORS[i % SEG_COLORS.length]} ${seg.start}deg ${seg.end}deg`)
      .join(', ');
    return `conic-gradient(${stops})`;
  }, [segments]);

  const settle = useCallback((prize: number, balance: number) => {
    setWonPrize(prize);
    setStatus('spun');
    setSpinning(false);
    // Keep the navbar CoinBadge and the XO card's balance live without a refresh
    // (same event the quiz / ad-watch / XO paths emit).
    window.dispatchEvent(new CustomEvent('coin-balance-update', { detail: { balance } }));
  }, []);

  const spin = useCallback(async () => {
    if (spinning || status !== 'available') return;
    setSpinning(true);
    setNote(null);

    const res = await spinWheelAction();

    if (res.status !== 'success' || res.prizeIndex === undefined || res.prize === undefined) {
      setSpinning(false);
      if (res.status === 'already_spun') setStatus('spun');
      else if (res.status === 'unavailable') setStatus('unavailable');
      setNote(res.message);
      return;
    }

    const { prizeIndex, prize, balance = 0 } = res;
    // Land the winning segment's centre at the top pointer.
    const centreAngle = segments[prizeIndex]?.centre ?? 0;

    if (reducedMotion()) {
      setRotation(-centreAngle);
      settle(prize, balance);
      return;
    }

    turnsRef.current += 5;
    const target = 360 * turnsRef.current - centreAngle;
    setRotation(target);
    // Matches the CSS transition duration below; on end we reveal the prize.
    window.setTimeout(() => settle(prize, balance), 3600);
  }, [spinning, status, segments, settle]);

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4 lg:col-span-2">
      <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <span aria-hidden className="text-lg">🎡</span>
        </div>
        <div>
          <h2 className="text-headline-md text-[18px]">Çarx</h2>
          <p className="text-legal-citation text-on-surface-variant">Gündə 1 pulsuz fırlatma</p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-5 pt-2">
        <div className="relative flex items-center justify-center">
          {/* Pointer */}
          <div
            aria-hidden
            className="absolute -top-1 z-10 size-0 border-x-8 border-t-[14px] border-x-transparent border-t-primary drop-shadow"
          />
          {/* Wheel */}
          <div
            className="relative size-56 rounded-full border-4 border-primary/40 shadow-lg"
            style={{
              background,
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? 'transform 3.5s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
            }}
          >
            {prizes.map((p, i) => (
              <span
                key={i}
                className="absolute left-1/2 top-1/2 text-sm font-bold text-white"
                style={{
                  transform: `rotate(${segments[i].centre}deg) translateY(-88px)`,
                  transformOrigin: '0 0',
                }}
              >
                {p.value}
              </span>
            ))}
            {/* Hub */}
            <div className="absolute left-1/2 top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary/50 bg-background text-primary">
              <CoinIcon width={18} height={18} />
            </div>
          </div>
        </div>

        {status === 'spun' && wonPrize !== null && (
          <p className="text-body-md font-semibold text-go-green" aria-live="polite">
            +{wonPrize} coin qazandın! 🎉
          </p>
        )}
        {note && status !== 'spun' && <p className="text-label-sm text-caution-orange">{note}</p>}

        {status === 'available' ? (
          <Button
            variant="primary"
            size="md"
            isPending={spinning}
            onPress={() => void spin()}
            className="glow-primary w-full max-w-xs justify-center"
          >
            {spinning ? 'Fırlanır…' : 'Fırlat (pulsuz)'}
          </Button>
        ) : status === 'spun' ? (
          <p className="text-label-sm tabular-nums text-on-surface-variant">
            {respinCountdown
              ? `${respinCountdown} sonra yenidən fırlada bilərsən.`
              : 'Sabah yenidən fırlada bilərsən.'}
          </p>
        ) : (
          <p className="text-label-sm text-on-surface-variant">Çarx hazırda əlçatan deyil.</p>
        )}
      </div>
    </div>
  );
}
