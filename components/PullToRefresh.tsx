'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Spinner } from '@/components/Spinner';

const DRAG_THRESHOLD = 10; // raw px before we commit to intercepting the gesture
const PULL_THRESHOLD = 70; // visual px (post-damping) required to trigger a refresh
const MAX_PULL = 90; // visual px cap
const RESISTANCE = 0.5; // damping factor applied to raw drag distance

function findScrollParent(el: Element | null): Element | null {
  let node = el;
  while (node && node !== document.body && node !== document.documentElement) {
    if (node instanceof HTMLElement) {
      const style = getComputedStyle(node);
      const canScrollY =
        (style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight;
      if (canScrollY) return node;
    }
    node = node.parentElement;
  }
  return null;
}

// Reimplements native pull-to-refresh, which disappears once the PWA runs in
// `display: standalone` (no browser chrome to provide the gesture). Touch-only
// by construction: touchstart/touchmove/touchend simply never fire on
// mouse/trackpad-driven desktop browsers, so no separate capability gate
// (`ontouchstart in window` etc.) is needed on top of that.
export function PullToRefresh({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pullRef = useRef(0);
  const dragStateRef = useRef({ startY: 0, tracking: false, dragging: false, scroller: null as Element | null });
  const [pull, setPull] = useState(0);
  const [releasing, setReleasing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    function updatePull(value: number) {
      pullRef.current = value;
      setPull(value);
    }

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      // Walk up from the actual touch point (not just this wrapper) to find
      // the nearest genuinely-scrollable ancestor. This matters because
      // pages like /chat have their own inner `overflow-y-auto` message list
      // (ChatClient's scrollContainerRef) that scrolls independently of this
      // outer wrapper. If we only checked this wrapper's own scrollTop, a
      // downward drag that starts while the inner list is scrolled down —
      // but the outer wrapper (which never itself scrolls) still reports
      // scrollTop 0 — would incorrectly arm pull-to-refresh mid-scroll. The
      // trade-off is one elementFromPoint + a short ancestor walk per
      // touchstart, which is cheap and only runs once per gesture.
      const scroller = findScrollParent(target);
      const scrollTop = scroller ? scroller.scrollTop : 0;
      dragStateRef.current = {
        startY: touch.clientY,
        tracking: scrollTop === 0,
        dragging: false,
        scroller,
      };
    }

    function onTouchMove(e: TouchEvent) {
      const s = dragStateRef.current;
      if (!s.tracking || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const deltaY = touch.clientY - s.startY;

      if (deltaY <= 0) {
        // Upward or no movement: not a pull-to-refresh gesture, let normal scrolling happen.
        s.tracking = false;
        s.dragging = false;
        updatePull(0);
        return;
      }

      if (s.scroller && s.scroller.scrollTop !== 0) {
        // Scroller moved under us — abort rather than fight it.
        s.tracking = false;
        s.dragging = false;
        updatePull(0);
        return;
      }

      if (deltaY > DRAG_THRESHOLD) {
        s.dragging = true;
      }

      if (s.dragging) {
        // Only prevent default once we've committed to showing the pull
        // indicator (past the drag threshold, at scrollTop 0, dragging
        // down) — never unconditionally, or normal scroll-down browsing
        // would break.
        e.preventDefault();
        updatePull(Math.min(deltaY * RESISTANCE, MAX_PULL));
      }
    }

    function onTouchEnd() {
      const s = dragStateRef.current;
      if (s.dragging) {
        if (pullRef.current >= PULL_THRESHOLD) {
          setRefreshing(true);
          // True full reload, not router.refresh() — matches the native
          // pull-to-refresh mental model. No service worker exists here to
          // intercept it differently.
          window.location.reload();
        } else {
          setReleasing(true);
          requestAnimationFrame(() => updatePull(0));
        }
      }
      dragStateRef.current = { startY: 0, tracking: false, dragging: false, scroller: null };
    }

    // touchmove must be a real (non-passive) listener — React's synthetic
    // touch handlers are passive by default since React 17, which silently
    // no-ops preventDefault().
    wrapper.addEventListener('touchstart', onTouchStart, { passive: true });
    wrapper.addEventListener('touchmove', onTouchMove, { passive: false });
    wrapper.addEventListener('touchend', onTouchEnd, { passive: true });
    wrapper.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      wrapper.removeEventListener('touchstart', onTouchStart);
      wrapper.removeEventListener('touchmove', onTouchMove);
      wrapper.removeEventListener('touchend', onTouchEnd);
      wrapper.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  const indicatorOffset = refreshing ? PULL_THRESHOLD : pull;

  return (
    <div ref={wrapperRef} className="relative flex flex-1 flex-col min-h-0">
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 z-40 flex justify-center ${
          releasing ? 'transition-transform duration-200 ease-out' : ''
        }`}
        style={{
          transform: `translateY(${indicatorOffset}px)`,
          opacity: indicatorOffset > 0 ? 1 : 0,
        }}
        onTransitionEnd={() => setReleasing(false)}
      >
        <div className="glass-panel mt-2 flex size-9 items-center justify-center rounded-full">
          <Spinner size="sm" />
        </div>
      </div>
      {children}
    </div>
  );
}
