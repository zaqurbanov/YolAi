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
// the theme (light/dark) like the rest of the HUD. The `--wheel-hud-seg-*`
// custom properties are the "Cyber-Circuit Legal" ([data-design='3d']) HUD
// override point — set on the wheel element itself via the `.wheel-hud-wheel`
// rule in app/globals.css — and fall back to the existing "sadə dizayn"
// tokens when that attribute/rule isn't present, so this file never needs to
// branch on design system at render time; the browser just resolves whichever
// custom property is in scope. Segment *angles* are untouched — only these
// two color sources are swappable.
const SEG_COLORS = [
  'var(--wheel-hud-seg-1, var(--color-primary))',
  'var(--wheel-hud-seg-2, var(--color-regulatory-blue))',
];

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Every segment gets an equal visual slice, regardless of its weight — the
// weight only drives the server-side probability of being selected
// (lib/coins/wheel.ts's spinWheel()), never how big the slice looks on
// screen. Shared by the conic-gradient stops, the label rotations and the
// pointer-landing math below, so they never disagree with each other.
function buildSegmentAngles(prizes: WheelPrize[]): { start: number; end: number; centre: number }[] {
  const angle = prizes.length > 0 ? 360 / prizes.length : 0;
  return prizes.map((_, i) => {
    const start = i * angle;
    const end = start + angle;
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
    <div className="glass-card wheel-hud-card rounded-2xl p-6 space-y-4 lg:col-span-2">
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
        {/*
         * `wheel-hud-wrap` carries the pulsing outer glow ring
         * (`[data-design='3d'] .wheel-hud-wrap::before`) around the wheel — a
         * purely decorative, purely visual addition scoped to the 3D design;
         * it's inert (no rule targets it) under the default/"simple" design.
         */}
        <div className="relative flex items-center justify-center wheel-hud-wrap">
          {/* Pointer */}
          <div
            aria-hidden
            className="absolute -top-1 z-10 size-0 border-x-8 border-t-[14px] border-x-transparent border-t-primary drop-shadow wheel-hud-pointer"
          />
          {/* Wheel */}
          <div
            className="relative size-56 rounded-full border-4 border-primary/40 shadow-lg wheel-hud-wheel"
            style={{
              background,
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? 'transform 3.5s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
            }}
          >
            {prizes.map((p, i) => (
              <span
                key={i}
                className="absolute left-1/2 top-1/2 text-sm font-bold text-white wheel-hud-label"
                style={{
                  // `--wheel-hud-label-radius` lets the bigger 3D wheel push
                  // labels further from centre (set on `.wheel-hud-wheel` in
                  // app/globals.css); falls back to the original 88px radius
                  // used by the default/"sadə dizayn" size-56 wheel.
                  transform: `rotate(${segments[i].centre}deg) translateY(calc(-1 * var(--wheel-hud-label-radius, 88px)))`,
                  transformOrigin: '0 0',
                }}
              >
                {p.value}
              </span>
            ))}
            {/* Hub */}
            <div className="absolute left-1/2 top-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary/50 bg-background text-primary wheel-hud-hub">
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
            className="glow-primary wheel-hud-spin-btn w-full max-w-xs justify-center"
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
