'use client';

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

interface DragState {
  pointerId: number;
  startX: number;
  startScrollLeft: number;
  dragged: boolean;
}

/**
 * One-card-per-drag horizontal snap rail.
 *
 * CSS `snap-x snap-mandatory` already guarantees the rail never RESTS between
 * cards on wheel/trackpad/keyboard, but on touch a fling can skip several
 * cards and some mobile browsers let it settle mid-card. This hook takes over
 * pointer/touch drags and re-lands them: the rail follows the finger 1:1 with
 * CSS snap disabled, and on release the destination is clamped to AT MOST one
 * card from where the drag started, then smooth-scrolled to that card
 * boundary. CSS snap is restored immediately — the destination is always a
 * snap point, so snap cannot yank it further.
 *
 * Why manual scroll instead of native touch scroll: `touch-pan-y` (not pan-x)
 * keeps vertical page scroll on the browser but hands horizontal moves to the
 * app, so WE own the follow distance instead of the browser's fling/momentum
 * math — that momentum is exactly what lets a finger skip three cards. A
 * diagonal drag becomes a pointercancel (the browser reclaimed the gesture),
 * which this hook treats as "give it back": no scrollTo, just snap restored.
 *
 * Tap (no drag) is not a scroll: the destination is the card the finger
 * started on, and its click still passes through. A real drag swallows the
 * trailing `click` so the card the finger releases over doesn't navigate.
 *
 * Spread the returned `railProps` onto the scroll container. It carries `ref`,
 * the pointer/scroll handlers and the click suppressor; the consumer must NOT
 * also bind its own ref or onScroll on that element. Generic over HTMLElement
 * so both FeatureRail (a div rail) and the Kurslar rail in MobileOyrenme can
 * use it; `count` clamps the index to [0, count-1] and guards the no-cards
 * case (a rail whose empty state renders a fallback element, not cards).
 */
export function useSnapRail<T extends HTMLElement>(count: number) {
  const railRef = useRef<T>(null);
  const [active, setActive] = useState(0);
  const dragRef = useRef<DragState | null>(null);
  // One-shot click suppressor. A drag's trailing `click` lands on whatever
  // element the finger released over (a Link, an UnlockCourseCard) and would
  // navigate. Set on pointerup when dragged, consumed by the rail's
  // onClickCapture, cleared at the next pointerdown — a click always fires
  // before the next pointerdown, so this can never swallow a genuine tap.
  const suppressClickRef = useRef(false);

  // Step = first card width + the gap, derived from the real DOM (not a
  // hardcoded pixel) so a markup change to card width or gap can't silently
  // drift the math. Returns 0 when the rail has no cards — callers treat 0 as
  // "nothing to snap".
  const stepOf = useCallback((rail: HTMLElement): number => {
    const first = rail.firstElementChild as HTMLElement | null;
    if (!first) return 0;
    const gap = parseFloat(getComputedStyle(rail).columnGap);
    return first.offsetWidth + (Number.isNaN(gap) ? 0 : gap);
  }, []);

  const clampIndex = useCallback(
    (i: number) => Math.max(0, Math.min(count - 1, i)),
    [count],
  );

  const releaseCapture = useCallback((rail: HTMLElement, pointerId: number) => {
    // hasPointerCapture guards the release — the browser may already have
    // dropped capture when it reclaimed the gesture (pointercancel).
    if (rail.hasPointerCapture(pointerId)) {
      try {
        rail.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
    }
  }, []);

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<T>) => {
      // Mouse: only the left button drags (a right-click must not start a
      // capture/drag). Touch/pen report no button.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const rail = railRef.current;
      if (!rail || count === 0 || !rail.firstElementChild) return;
      // Cancel any in-flight smooth scroll (a dot tap or the previous drag's
      // landing) so the 1:1 follow below isn't racing the animation.
      rail.scrollTo({ left: rail.scrollLeft, behavior: 'auto' });
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startScrollLeft: rail.scrollLeft,
        dragged: false,
      };
      // Snap off for the duration of the drag: with snap-mandatory live, every
      // scrollLeft write would snap-jump toward the next card and fight the
      // finger. Restored on up/cancel — the destination is always a snap
      // point, so CSS snap can't move it afterwards.
      rail.style.scrollSnapType = 'none';
      suppressClickRef.current = false;
      try {
        rail.setPointerCapture(e.pointerId);
      } catch {
        // Capture can throw for an already-completed gesture; the drag still
        // works via the rail's own pointer handlers while the finger is over it.
      }
    },
    [count],
  );

  const handlePointerMove = useCallback((e: ReactPointerEvent<T>) => {
    const drag = dragRef.current;
    const rail = railRef.current;
    if (!drag || !rail || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) > 6) drag.dragged = true;
    // 1:1 follow — no momentum, so the finger can only ever pull the rail as
    // far as it actually moved.
    rail.scrollLeft = drag.startScrollLeft - dx;
  }, []);

  const handlePointerUp = useCallback(
    (e: ReactPointerEvent<T>) => {
      const rail = railRef.current;
      const drag = dragRef.current;
      if (!rail || !drag || drag.pointerId !== e.pointerId) return;
      dragRef.current = null;
      releaseCapture(rail, e.pointerId);

      const step = stepOf(rail);
      if (step === 0) {
        rail.style.scrollSnapType = '';
        return;
      }

      const startIndex = Math.round(drag.startScrollLeft / step);
      let target = startIndex;
      if (drag.dragged) {
        // At most ONE card per drag. The rail may have been pulled past
        // several cards during pointermove, so the destination is clamped to
        // startIndex ± 1 — or startIndex itself when the drag ended within the
        // same card (e.g. a jitter that crossed the 6px drag threshold).
        const currentIndex = Math.round(rail.scrollLeft / step);
        target = Math.max(startIndex - 1, Math.min(startIndex + 1, currentIndex));
      }
      target = clampIndex(target);
      rail.scrollTo({ left: target * step, behavior: 'smooth' });
      rail.style.scrollSnapType = '';
      setActive(target);
      if (drag.dragged) suppressClickRef.current = true;
    },
    [releaseCapture, stepOf, clampIndex],
  );

  const handlePointerCancel = useCallback(
    (e: ReactPointerEvent<T>) => {
      // Browser reclaimed the gesture (vertical pan, e.g.). Drop drag state
      // and restore snap, but do NOT scrollTo — the browser owns the gesture
      // now and a scrollTo would fight its scroll.
      const rail = railRef.current;
      const drag = dragRef.current;
      if (!rail || !drag || drag.pointerId !== e.pointerId) return;
      dragRef.current = null;
      releaseCapture(rail, e.pointerId);
      rail.style.scrollSnapType = '';
    },
    [releaseCapture],
  );

  const handleScroll = useCallback(() => {
    const rail = railRef.current;
    if (!rail || count === 0) return;
    const step = stepOf(rail);
    if (step === 0) return;
    setActive(clampIndex(Math.round(rail.scrollLeft / step)));
  }, [count, stepOf, clampIndex]);

  const handleClickCapture = useCallback((e: ReactMouseEvent<T>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  function goTo(index: number) {
    const rail = railRef.current;
    if (!rail || count === 0) return;
    const step = stepOf(rail);
    if (step === 0) return;
    const target = clampIndex(index);
    rail.scrollTo({ left: target * step, behavior: 'smooth' });
    setActive(target);
  }

  // Stable object so consumers can destructure only what they need without
  // causing the rail div to re-bind handlers on every render.
  const railProps = useMemo(
    () => ({
      ref: railRef,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onScroll: handleScroll,
      onClickCapture: handleClickCapture,
    }),
    [handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handleScroll, handleClickCapture],
  );

  return { railRef, active, railProps, goTo };
}
