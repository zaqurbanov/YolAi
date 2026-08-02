'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { EnergyIcon } from '@/components/icons';
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
//
// Since 0094 the prizes are ENERGY, not coins — every glyph and label here must
// say so (WheelPrize.value is an energy amount).
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

  const settle = useCallback((prize: number, balance: number, energy: number) => {
    setWonPrize(prize);
    setStatus('spun');
    setSpinning(false);
    // Keep the navbar CoinBadge and EnergyBadge live without a refresh (same
    // events the quiz / ad-watch / XO paths emit). The wheel pays ENERGY, so
    // `balance` (coins) is unchanged and only `energy` actually moves.
    window.dispatchEvent(new CustomEvent('coin-balance-update', { detail: { balance } }));
    window.dispatchEvent(new CustomEvent('energy-balance-update', { detail: { balance: energy } }));
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

    const { prizeIndex, prize, balance = 0, energy = 0 } = res;
    // Land the winning segment's centre at the top pointer.
    const centreAngle = segments[prizeIndex]?.centre ?? 0;

    if (reducedMotion()) {
      setRotation(-centreAngle);
      settle(prize, balance, energy);
      return;
    }

    turnsRef.current += 5;
    const target = 360 * turnsRef.current - centreAngle;
    setRotation(target);
    // Matches the CSS transition duration below; on end we reveal the prize.
    window.setTimeout(() => settle(prize, balance, energy), 3600);
  }, [spinning, status, segments, settle]);

  return (
    <div className="glass-card wheel-hud-card rounded-2xl p-6 space-y-4 lg:col-span-2">
      <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <span aria-hidden className="text-lg">🎡</span>
        </div>
        <div>
          <h2 className="text-headline-md text-[18px]">Çarx</h2>
          <p className="text-legal-citation text-on-surface-variant">
            Gündə 1 pulsuz fırlatma · enerji qazanırsan
          </p>
        </div>
      </div>

      <div className="flex flex-col items-center gap-5 pt-2">
        {/*
         * `wheel-hud-wrap` carries the pulsing outer glow ring
         * (`.wheel-hud-wrap::before` in app/globals.css) around the wheel — a
         * purely decorative, purely visual ring. The base rule uses
         * `var(--color-primary)`; the 3D override swaps to `var(--hud-primary)`.
         */}
        <div className="relative flex items-center justify-center wheel-hud-wrap">
          {/* Pointer — solid filled triangle matching the Stitch reference's
              prominent gold pointer. CSS border trick (transparent sides +
              colored top) creates a clean triangle without clip-path. Sized
              at 12/22px for better visual weight on the wheel ring. The base
              `border-t-primary` tracks the theme accent; the 3D override in
              globals.css swaps to `var(--hud-primary)`. Drop-shadow is handled
              by `.wheel-hud-pointer` in globals.css (theme-aware color-mix),
              not a hardcoded Tailwind utility. */}
          <div
            aria-hidden
            className="absolute -top-1 z-10 size-0 border-x-[12px] border-t-[22px] border-x-transparent border-t-primary wheel-hud-pointer"
          />
          {/* Wheel disc — conic-gradient segments rendered via the `background`
              useMemo above. Thicker border (8px) matches the Stitch reference's
              prominent gold ring; `border-primary/60` gives a solid accent ring
              in both themes. The 3D override in globals.css increases this further
              and swaps to `var(--hud-primary)`. */}
          <div
            className="relative size-64 rounded-full border-[8px] border-primary/60 shadow-lg wheel-hud-wheel"
            style={{
              background,
              transform: `rotate(${rotation}deg)`,
              transition: spinning ? 'transform 3.5s cubic-bezier(0.16, 1, 0.3, 1)' : 'none',
            }}
          >
            {prizes.map((p, i) => (
              <span
                key={i}
                className="absolute left-1/2 top-1/2 text-sm font-bold text-white uppercase tracking-wide wheel-hud-label"
                style={{
                  // `--wheel-hud-label-radius` lets the bigger 3D wheel push
                  // labels further from centre (set on `.wheel-hud-wrap` in
                  // app/globals.css); falls back to 98px for the base
                  // size-64 wheel (set on `.wheel-hud-wrap` base rule).
                  transform: `rotate(${segments[i].centre}deg) translateY(calc(-1 * var(--wheel-hud-label-radius, 98px)))`,
                  transformOrigin: '0 0',
                }}
              >
                {p.value}
              </span>
            ))}
            {/* Hub — solid primary-colored center matching the Stitch reference's
                gold hub. `bg-primary` gives a filled accent circle; `text-on-primary`
                ensures the EnergyIcon is legible on the filled background. `border-2`
                gives a thin ring for visual definition that the 3D override swaps to
                `var(--hud-bg-deep)` for the dark-border-on-gold look. */}
            <div className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-primary/30 bg-primary text-on-primary wheel-hud-hub">
              <EnergyIcon width={18} height={18} />
            </div>
          </div>
        </div>

        {status === 'spun' && wonPrize !== null && (
          <p
            className="flex items-center gap-1.5 text-body-md font-semibold text-go-green"
            aria-live="polite"
          >
            <EnergyIcon width={16} height={16} />+{wonPrize} enerji qazandın! 🎉
          </p>
        )}
        {note && status !== 'spun' && <p className="text-label-sm text-caution-orange">{note}</p>}

        {status === 'available' ? (
          <Button
            variant="primary"
            size="md"
            isPending={spinning}
            onPress={() => void spin()}
            className="glow-primary wheel-hud-spin-btn w-full max-w-xs justify-center uppercase tracking-wider"
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
