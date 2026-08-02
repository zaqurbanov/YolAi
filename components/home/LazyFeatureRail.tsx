'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';
import { useInViewOnce } from './useInViewOnce';

// Literal import path at module scope — the next/dynamic requirement for
// code-splitting (a wrapper taking `load()` as a prop would NOT split).
const FeatureRail = dynamic(() => import('./FeatureRail'));

interface LazyFeatureRailProps {
  /**
   * Grid classes for the desktop layout — same contract as FeatureRail
   * (defaults to 2 columns; the games showcase passes 3). Home passes none.
   */
  desktopClassName?: string;
  /** Server-rendered cards. Crosses the RSC boundary as a prop, same as FeatureRail. */
  children: ReactNode;
}

/**
 * Home-route-only lazy version of FeatureRail (components/home/FeatureRail).
 * FeatureRail's own rail logic (snap, drag, dots) is deferred until the rail
 * scrolls within 300px of the viewport. The placeholder reserves the rail's
 * approximate height (mobile: one card row + counter; desktop: the 2-col grid)
 * so the swap doesn't shift the page. Other FeatureRail consumers
 * (MobileOyrenme, GamesShowcase, GaragePreviewCard) keep the static import.
 */
export default function LazyFeatureRail({ children, desktopClassName }: LazyFeatureRailProps) {
  const { ref, revealed } = useInViewOnce<HTMLDivElement>();

  return (
    <div ref={ref}>
      {revealed ? (
        <FeatureRail desktopClassName={desktopClassName}>{children}</FeatureRail>
      ) : (
        <>
          {/* Mobile: counter row (~32px) + one card row (~290px). */}
          <div
            aria-hidden="true"
            className="rounded-3xl border border-border/40 bg-surface-tertiary/30 md:hidden"
            style={{ height: 322 }}
          />
          {/* Desktop: 2 rows of cards + the gap (long descs can wrap to 4 lines). */}
          <div
            aria-hidden="true"
            className="hidden rounded-3xl border border-border/40 bg-surface-tertiary/30 md:block"
            style={{ height: 520 }}
          />
        </>
      )}
    </div>
  );
}
