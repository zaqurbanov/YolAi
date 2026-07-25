'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  className?: string;
  durationMs?: number;
  /** Formats the (possibly fractional, mid-tween) display value. Defaults to a rounded integer. */
  format?: (n: number) => string;
}

// Tweens the DISPLAYED digits from the previous value to `value` with rAF.
// `value` (the prop) is always authoritative and the tween always lands exactly
// on it — this never invents or derives a number, it only animates old→new.
// First mount and reduced-motion jump straight to the value. Reusable wherever a
// coin/point total changes after a server response.
export default function AnimatedNumber({ value, className, durationMs = 600, format }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return;

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Reduced motion collapses the tween to a single frame (a jump, not a
    // roll). setDisplay only ever runs inside the async rAF callback below,
    // never synchronously in this effect body.
    const duration = reduce ? 0 : durationMs;

    const start = performance.now();
    const delta = value - from;
    const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic

    function tick(now: number) {
      const t = duration <= 0 ? 1 : Math.min(1, (now - start) / duration);
      setDisplay(t >= 1 ? value : from + delta * ease(t));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    }
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
    };
  }, [value, durationMs]);

  return <span className={className}>{format ? format(display) : String(Math.round(display))}</span>;
}
