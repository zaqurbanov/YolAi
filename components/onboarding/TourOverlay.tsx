'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import { TOUR_STEPS } from '@/lib/onboarding/tourSteps';
import { useTour } from '@/components/onboarding/TourProvider';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface CardPosition {
  top: number;
  left: number;
}

const SPOTLIGHT_PADDING = 8;
const CARD_GAP = 16;
const VIEWPORT_MARGIN = 16;
const POLL_INTERVAL_MS = 50;
const MAX_POLL_ATTEMPTS = 60; // ~3s worth of polling per step, then give up gracefully

// Rendered by TourProvider only while a tour is active. Owns: locating the
// current step's target element (navigating pages when the step requires it),
// tracking its on-screen rect through scroll/resize, and positioning the tour
// card relative to it without overflowing the viewport.
export function TourOverlay() {
  const { activeStepIndex, next, back, skip, finish } = useTour();
  const router = useRouter();
  const pathname = usePathname();

  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [cardPos, setCardPos] = useState<CardPosition | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  const targetElRef = useRef<Element | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = activeStepIndex != null ? TOUR_STEPS[activeStepIndex] : null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR/portal-target guard, mirrors the mount-time-sync pattern used elsewhere in this app (e.g. lib/theme/useDarkMode.ts)
    setPortalReady(true);
  }, []);

  const measure = useCallback(() => {
    if (!targetElRef.current) return;
    const r = targetElRef.current.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, []);

  // Locate the target element for the current step. If the step lives on a
  // different route, navigate there first, then poll (capped) for the
  // element to appear post-navigation/hydration. Never throws if the target
  // never shows up — it just stops polling and TourOverlay falls back to a
  // centered, un-spotlit card so the user isn't stuck.
  useEffect(() => {
    if (!step) return;
    let cancelled = false;
    targetElRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting spotlight state for the new step, not reacting to a React value
    setRect(null);
    setNotFound(false);

    function tryFind(): boolean {
      const el = document.querySelector(step!.target);
      if (!el) return false;
      targetElRef.current = el;
      const r = el.getBoundingClientRect();
      if (!cancelled) setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      return true;
    }

    function poll(attempt: number) {
      if (cancelled) return;
      if (tryFind()) return;
      if (attempt >= MAX_POLL_ATTEMPTS) {
        if (!cancelled) setNotFound(true);
        return;
      }
      window.setTimeout(() => poll(attempt + 1), POLL_INTERVAL_MS);
    }

    if (step.page !== pathname) {
      router.push(step.page);
    }
    poll(0);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the step itself changes, not on every pathname tick caused by router.push above
  }, [step]);

  // Reposition on scroll/resize, plus a ResizeObserver on the target element
  // itself (its size can change independently, e.g. sidebar collapse).
  const hasRect = rect != null;
  useEffect(() => {
    if (!step || !hasRect) return;
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    let ro: ResizeObserver | null = null;
    if (targetElRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(targetElRef.current);
    }
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      ro?.disconnect();
    };
  }, [step, hasRect, measure]);

  // Position the tour card relative to the spotlight rect, flipping
  // above/below/left/right based on available viewport space, then clamping
  // so it never overflows the screen edges.
  useLayoutEffect(() => {
    if (!rect) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing card position when the spotlight target disappears (step change), not a reactive external subscription
      setCardPos(null);
      return;
    }
    const cw = cardRef.current?.offsetWidth ?? 340;
    const ch = cardRef.current?.offsetHeight ?? 200;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top: number;
    let left: number;

    const spaceBelow = vh - (rect.top + rect.height);
    const spaceAbove = rect.top;
    const spaceRight = vw - (rect.left + rect.width);
    const spaceLeft = rect.left;

    if (spaceBelow >= ch + CARD_GAP + VIEWPORT_MARGIN) {
      top = rect.top + rect.height + CARD_GAP;
      left = rect.left;
    } else if (spaceAbove >= ch + CARD_GAP + VIEWPORT_MARGIN) {
      top = rect.top - ch - CARD_GAP;
      left = rect.left;
    } else if (spaceRight >= cw + CARD_GAP + VIEWPORT_MARGIN) {
      top = rect.top;
      left = rect.left + rect.width + CARD_GAP;
    } else if (spaceLeft >= cw + CARD_GAP + VIEWPORT_MARGIN) {
      top = rect.top;
      left = rect.left - cw - CARD_GAP;
    } else {
      // No side has enough room (small viewport) — pin below and let clamping handle overflow.
      top = rect.top + rect.height + CARD_GAP;
      left = rect.left;
    }

    left = Math.min(Math.max(left, VIEWPORT_MARGIN), vw - cw - VIEWPORT_MARGIN);
    top = Math.min(Math.max(top, VIEWPORT_MARGIN), vh - ch - VIEWPORT_MARGIN);

    setCardPos({ top, left });
  }, [rect]);

  if (!portalReady || !step) return null;

  const stepIndex = activeStepIndex as number;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;
  const progressPct = ((stepIndex + 1) / TOUR_STEPS.length) * 100;
  const showSpotlight = rect != null && !notFound;
  const showCard = (rect != null && cardPos != null) || notFound;

  const card = (
    <div
      ref={cardRef}
      className="glass-panel tour-card-in fixed z-[1000] w-[calc(100vw-2rem)] max-w-[340px] rounded-2xl p-5"
      style={
        cardPos
          ? { top: cardPos.top, left: cardPos.left }
          : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
      }
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-legal-citation rounded-full bg-primary/15 px-2.5 py-1 text-primary">
          {stepIndex + 1}/{TOUR_STEPS.length}
        </span>
        <button
          type="button"
          onClick={skip}
          className="text-xs font-medium text-on-surface-variant transition-colors hover:text-on-surface"
        >
          Keç
        </button>
      </div>
      <div className="mb-3 h-1 w-full overflow-hidden rounded-full bg-surface-tertiary/60">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${progressPct}%` }}
        />
      </div>
      <h3 className="text-headline-md mb-1 text-[16px] text-on-surface">{step.title}</h3>
      <p className="text-body-md mb-4 text-on-surface-variant">{step.description}</p>
      <div className="flex items-center justify-between gap-2">
        {!isFirst ? (
          <button
            type="button"
            onClick={back}
            className="rounded-lg px-3 py-2 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-hover hover:text-on-surface"
          >
            Geri
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={isLast ? finish : next}
          className={`rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-accent-foreground transition-transform active:scale-[0.98] ${
            isLast ? 'glow-primary' : ''
          }`}
        >
          {isLast ? 'Bitir' : 'İrəli'}
        </button>
      </div>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[999]">
      {showSpotlight && (
        <div
          aria-hidden
          className="tour-spotlight pointer-events-none fixed rounded-xl"
          style={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
          }}
        />
      )}
      {!showSpotlight && <div className="fixed inset-0 bg-black/60" />}
      {showCard && card}
    </div>,
    document.body
  );
}
