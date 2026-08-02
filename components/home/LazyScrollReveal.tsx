'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { useInViewOnce } from './useInViewOnce';

const ScrollReveal = dynamic(() => import('@/components/ScrollReveal'));

interface LazyScrollRevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger delay in ms applied to the reveal transition — same contract as ScrollReveal. */
  delayMs?: number;
}

/**
 * Home-route-only lazy version of components/ScrollReveal, one per category
 * card in the "Baza" grid. ScrollReveal itself is tiny (~2KB) — this wrapper's
 * real cost saving is deferring the card subtree's client reference, not the
 * reveal animation JS. Placeholder reserves the card's approximate height so
 * the desktop grid doesn't collapse before the section is scrolled to.
 */
export default function LazyScrollReveal({ children, className, delayMs }: LazyScrollRevealProps) {
  const { ref, revealed } = useInViewOnce<HTMLDivElement>();

  return (
    <div ref={ref} className={className}>
      {revealed ? (
        <ScrollReveal delayMs={delayMs}>{children}</ScrollReveal>
      ) : (
        <div
          aria-hidden="true"
          className="h-full rounded-2xl border border-border/40 bg-surface-tertiary/30"
          style={{ minHeight: 190 }}
        />
      )}
    </div>
  );
}
