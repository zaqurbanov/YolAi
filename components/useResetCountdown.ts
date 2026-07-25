'use client';

import { useEffect, useState } from 'react';

// Milliseconds remaining until the next Asia/Baku 00:00. Baku is a fixed UTC+4
// with no DST, but the offset is derived from the zone NAME via Intl (never a
// hardcoded +4) so this stays correct if that ever changes. We read the current
// Baku wall-clock and subtract its elapsed time-of-day from a full 24h day.
function msUntilNextBakuMidnight(): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baku',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // en-GB can emit '24' for midnight; normalize to 0.
  const h = get('hour') % 24;
  const m = get('minute');
  const s = get('second');
  const elapsedMs = ((h * 60 + m) * 60 + s) * 1000;
  const dayMs = 86_400_000;
  const remaining = dayMs - elapsedMs;
  return remaining <= 0 ? dayMs : remaining;
}

// Zero-padded HH:MM:SS from a millisecond duration.
export function formatCountdown(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// Live HH:MM:SS string ticking every second toward the next Asia/Baku 00:00 —
// the single source of truth for every "time until daily reset" countdown, so
// they stay in lockstep with the server's Baku-midnight resets. Pass `enabled`
// false (e.g. a closed modal) to stop ticking; returns null while disabled or
// before the first paint. Computes an immediate first value via rAF so it never
// shows a blank frame.
export function useResetCountdown(enabled: boolean = true): string | null {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    // Don't reset synchronously here; the return below masks the stale value
    // while disabled, and rAF recomputes a fresh one the moment it re-enables.
    if (!enabled) return;
    const tick = () => setValue(formatCountdown(msUntilNextBakuMidnight()));
    const raf = requestAnimationFrame(tick);
    const id = window.setInterval(tick, 1000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(id);
    };
  }, [enabled]);
  return enabled ? value : null;
}
