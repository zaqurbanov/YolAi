'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { TOUR_STEPS } from '@/lib/onboarding/tourSteps';
import { TourOverlay } from '@/components/onboarding/TourOverlay';

const SEEN_KEY = 'yol-onboarding-tour-seen';

interface TourContextValue {
  activeStepIndex: number | null;
  start: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  finish: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
}

// Global, single-instance guided tour: owns which step is active (null = not
// running) and the "seen" flag. Page navigation between steps and spotlight
// positioning both live in TourOverlay — this provider only owns state +
// persistence, so start()/next()/back() are just index changes; whenever the
// active step's `page` differs from the current route, TourOverlay reacts to
// that mismatch and calls router.push itself (see its effect).
export function TourProvider({ children }: { children: ReactNode }) {
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const autoStartCheckedRef = useRef(false);

  // Auto-start once, on first mount, only if the tour has never been seen —
  // the Sidebar (server component) needs a tick to hydrate before
  // [data-tour-root="authenticated"] exists in the DOM, so this polls briefly
  // instead of checking synchronously on mount.
  useEffect(() => {
    if (autoStartCheckedRef.current) return;
    autoStartCheckedRef.current = true;
    if (typeof window === 'undefined') return;
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      return;
    }
    if (seen) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 40; // ~2s total at 50ms/attempt
    const poll = () => {
      if (cancelled) return;
      if (document.querySelector('[data-tour-root="authenticated"]')) {
        setActiveStepIndex(0);
        return;
      }
      attempts += 1;
      if (attempts >= maxAttempts) return;
      window.setTimeout(poll, 50);
    };
    const initialDelay = window.setTimeout(poll, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(initialDelay);
    };
  }, []);

  const persistSeen = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Ignore — worst case the tour just re-offers itself next visit.
    }
  }, []);

  const finish = useCallback(() => {
    persistSeen();
    setActiveStepIndex(null);
  }, [persistSeen]);

  // "Keç" and "Bitir" have no behavioral difference — both end the tour and
  // persist the seen flag — so they share one implementation.
  const skip = finish;

  // Manual restart (NavBarMenu's "Turu yenidən göstər") — clears the seen
  // flag so a later hard reload wouldn't accidentally suppress a future
  // auto-start, then jumps to step 0. Navigating to step 0's page (if not
  // already there) is handled by TourOverlay's own effect, not here.
  const start = useCallback(() => {
    try {
      localStorage.removeItem(SEEN_KEY);
    } catch {
      // Ignore — restart still works for this session even if persistence fails.
    }
    setActiveStepIndex(0);
  }, []);

  const next = useCallback(() => {
    setActiveStepIndex((prev) => {
      if (prev == null) return prev;
      const nextIndex = prev + 1;
      return nextIndex < TOUR_STEPS.length ? nextIndex : prev;
    });
  }, []);

  const back = useCallback(() => {
    setActiveStepIndex((prev) => (prev != null && prev > 0 ? prev - 1 : prev));
  }, []);

  return (
    <TourContext.Provider value={{ activeStepIndex, start, next, back, skip, finish }}>
      {children}
      {activeStepIndex !== null && <TourOverlay />}
    </TourContext.Provider>
  );
}
