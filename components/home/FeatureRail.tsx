'use client';

import { Children, type ReactNode } from 'react';
import { useSnapRail } from './SnapRail';

interface FeatureRailProps {
  /**
   * Grid classes for the desktop layout. Defaults to 2 columns (the home
   * page's four pillars); the games showcase passes 3.
   */
  desktopClassName?: string;
  /**
   * Already-rendered cards. Passed as children rather than as data because the
   * cards carry icon COMPONENTS, which cannot cross a server/client boundary
   * as props — the server renders them, this client component only owns the
   * rail, the scroll listener and the dots. Same shape as DesignSwitch /
   * CoinQazanPage3D, which take ReactNode props for the same reason.
   */
  children: ReactNode;
}

/**
 * Mobile: a horizontal snap rail. Desktop (`md:`): the plain 2-column grid,
 * untouched — horizontal scrolling is a phone affordance, and on desktop the
 * grid already shows all four at once.
 *
 * Three separate signals that another card exists, because any one alone is
 * missable:
 *  1. PEEK — cards are 78vw, so the next card's edge is always on screen. This
 *     is the strongest cue and the only one that works with no chrome at all.
 *  2. SNAP — the rail snaps card-to-card, so a small drag completes into the
 *     next card and teaches the gesture.
 *  3. COUNTER + DOTS — "01 / 04" and a progress dot row, so the user knows how
 *     many remain, not just that something is there.
 *
 * ⚠️ `overflow-y-hidden` is load-bearing, not cosmetic. Tailwind's
 * `overflow-x-auto` alone makes CSS compute `overflow-y: auto` too, and
 * PullToRefresh's findScrollParent (components/PullToRefresh.tsx) treats any
 * ancestor with a computed `overflow-y: auto` whose scrollHeight exceeds its
 * clientHeight as THE scroller. It would then read this rail's scrollTop of 0
 * and arm pull-to-refresh in the middle of the page — a downward swipe here
 * would reload the app. Forcing `overflow-y: hidden` fails that test so the
 * walk continues up to <main>, which is the real scroller.
 */
export default function FeatureRail({
  children,
  desktopClassName = 'md:grid-cols-2',
}: FeatureRailProps) {
  const slides = Children.toArray(children);
  // One-card-per-drag touch behavior lives in useSnapRail (SnapRail.tsx) —
  // same rail this component owns, same step math, plus drag re-landing and
  // click suppression. `active`/`goTo` feed the dots and counter below.
  const { active, railProps, goTo } = useSnapRail<HTMLDivElement>(slides.length);

  return (
    <>
      <div className="md:hidden">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-teal-deep tabular-nums">
            {String(active + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
          </span>
          <div className="flex items-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`${i + 1}-ci karta keç`}
                aria-current={i === active ? 'true' : undefined}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === active ? 'w-6 bg-primary' : 'w-1.5 bg-navy/20'
                }`}
              />
            ))}
          </div>
        </div>

        <div
          {...railProps}
          // -mx-6/px-6 lets the rail bleed to the screen edges while the first
          // card still lines up with the page's text column. touch-pan-y hands
          // horizontal drags to useSnapRail (SnapRail.tsx) instead of native
          // fling scroll; select-none stops text from being selected while
          // dragging with a mouse on desktop.
          className="no-scrollbar -mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto overflow-y-hidden px-6 pb-2 touch-pan-y select-none"
        >
          {slides.map((slide, i) => (
            <div key={i} className="w-[78vw] max-w-[320px] shrink-0 snap-start">
              {slide}
            </div>
          ))}
        </div>
      </div>

      <div className={`hidden gap-4 md:grid ${desktopClassName}`}>{children}</div>
    </>
  );
}
