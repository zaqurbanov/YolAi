'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Fires `revealed` once when the referenced element approaches the viewport.
 *
 * The IntersectionObserver rootMargin lead-in (300px below the fold by default)
 * gives the deferred dynamic chunk time to load while the placeholder is still
 * off-screen, so the placeholder→content swap happens before the section is
 * actually visible. State is set from the OBSERVER CALLBACK only (event-driven,
 * never synchronously in the effect body) — same pattern as
 * components/ScrollReveal.tsx, so it stays clear of the
 * `react-hooks/set-state-in-effect` rule. Falls back to revealing on the next
 * frame when IntersectionObserver is unavailable so content can never be left
 * stuck hidden.
 */
export function useInViewOnce<T extends HTMLElement>(rootMargin = '0px 0px 300px 0px') {
  const ref = useRef<T>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof IntersectionObserver === 'undefined') {
      const id = requestAnimationFrame(() => setRevealed(true));
      return () => cancelAnimationFrame(id);
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);

  return { ref, revealed };
}
