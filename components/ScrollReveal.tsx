'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger delay in ms applied to the reveal transition. */
  delayMs?: number;
}

// Reveals its children (fade + slight rise) the first time they scroll into
// view, replacing the previous load-time entrance. Degrades to immediately
// visible when reduced motion is requested or IntersectionObserver is
// unavailable — never leaves content stuck invisible. The `.reveal-on-scroll`
// base + `@media (prefers-reduced-motion)` reset live in app/globals.css.
export default function ScrollReveal({ children, className, delayMs = 0 }: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Reduced motion is handled entirely in CSS (the media query forces the
    // base state visible), so no JS state change is needed for that case.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // No IntersectionObserver support: reveal on the next frame so nothing is
    // left invisible (async, not a synchronous setState in the effect body).
    if (typeof IntersectionObserver === 'undefined') {
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal-on-scroll${visible ? ' reveal-visible' : ''}${className ? ` ${className}` : ''}`}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
