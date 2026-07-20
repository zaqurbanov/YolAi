'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { TOUR_STEPS } from '@/lib/onboarding/tourSteps';
import { TourOverlay } from '@/components/onboarding/TourOverlay';

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
// running). Opt-in only — the tour never auto-starts, it only runs when the
// user explicitly triggers it (NavBarMenu's "Turu yenidən göstər"), per user
// feedback that auto-starting on every visit was disruptive. Page navigation
// between steps and spotlight positioning both live in TourOverlay — this
// provider only owns state, so start()/next()/back() are just index changes;
// whenever the active step's `page` differs from the current route,
// TourOverlay reacts to that mismatch and calls router.push itself (see its
// effect).
export function TourProvider({ children }: { children: ReactNode }) {
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);

  const finish = useCallback(() => {
    setActiveStepIndex(null);
  }, []);

  // "Keç" and "Bitir" have no behavioral difference — both just end the tour
  // — so they share one implementation.
  const skip = finish;

  // Only entry point that starts the tour (NavBarMenu's "Turu yenidən
  // göstər") — jumps to step 0. Navigating to step 0's page (if not already
  // there) is handled by TourOverlay's own effect, not here.
  const start = useCallback(() => {
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
