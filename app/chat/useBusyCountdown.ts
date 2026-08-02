'use client';

import { useEffect, useState } from 'react';

// Median full-answer latency (see chat_request_logs after migration 0063);
// deliberately a touch above it so the countdown usually finishes just as —
// or slightly after — the first tokens stream in.
export const COUNTDOWN_FROM_SECONDS = 10;

// Shared between the desktop (ChatClient.BusyIndicator) and mobile
// (MobileChat.MobileBusyIndicator) busy rows: a 250ms elapsed-time ticker that
// backs a "time left" countdown while the answer is being generated. Split
// into a hook so both consumers share ONE ticker implementation, and so each
// caller can contain the tick inside a tiny memoized subtree instead of
// re-rendering the whole message list on every tick (the desktop measured
// 56-98ms main-thread longtasks at this cadence before it was isolated).
export function useBusyCountdown(isBusy: boolean): {
  elapsedMs: number;
  remaining: number;
} {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (!isBusy) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the timer when the busy state ends, same pattern as the other busy/stream resets in this codebase.
      setElapsedMs(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => setElapsedMs(Date.now() - start), 250);
    return () => clearInterval(interval);
  }, [isBusy]);

  // Countdown, not count-up: anticipation reads better than a climbing timer.
  // Clamped at 0 — a counter that goes negative or freezes at 0 would signal
  // "stuck", the opposite of the intent, so callers render "az qaldı…" once
  // the window passes.
  const remaining = Math.max(0, COUNTDOWN_FROM_SECONDS - Math.floor(elapsedMs / 1000));
  return { elapsedMs, remaining };
}
