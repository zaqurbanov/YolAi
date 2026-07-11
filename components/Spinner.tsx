'use client';

import dynamic from 'next/dynamic';
import loadingAnimation from '@/public/loading.json';

// lottie-web (behind lottie-react) is ~100KB gzipped — too heavy to ship on
// every button/inline spinner. Dynamic-import with ssr:false code-splits it
// into its own chunk that only loads when SpinnerPanel actually mounts
// (route loading.tsx boundaries, GoogleSignInButton's redirect wait, etc.).
const Lottie = dynamic(() => import('lottie-react'), { ssr: false });

const INLINE_SIZES = {
  sm: 'size-4 border-2',
  md: 'size-6 border-2',
  lg: 'size-8 border-[3px]',
} as const;

type SpinnerSize = keyof typeof INLINE_SIZES;

interface SpinnerProps {
  size?: SpinnerSize;
  /**
   * 'primary' (default) — HUD accent-blue ring, for use next to text or on
   * transparent/tertiary/outline buttons.
   * 'current' — ring inherits currentColor, for use inside solid-fill
   * buttons (primary/danger variants) where a primary-blue ring would have
   * poor contrast against a primary-colored background.
   */
  tone?: 'primary' | 'current';
  className?: string;
  'aria-label'?: string;
}

/**
 * Inline HUD spinner — lightweight CSS ring in the primary accent color.
 * Use everywhere a loading state sits next to text or inside a button
 * (chat "Cavab hazırlanır...", form submit buttons, etc). For a full-panel
 * loading state (route transitions), use `SpinnerPanel` instead.
 */
export function Spinner({
  size = 'sm',
  tone = 'primary',
  className = '',
  'aria-label': ariaLabel = 'Yüklənir',
}: SpinnerProps) {
  const toneClass = tone === 'primary' ? 'border-primary/25 border-t-primary' : 'border-current/25 border-t-current';

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={`inline-block shrink-0 animate-spin rounded-full ${toneClass} ${INLINE_SIZES[size]} ${className}`}
    />
  );
}

const PANEL_SIZES = {
  md: 'size-28 sm:size-36',
  lg: 'size-36 sm:size-44',
} as const;

interface SpinnerPanelProps {
  label?: string;
  size?: keyof typeof PANEL_SIZES;
  className?: string;
}

/**
 * Full glass-panel loading presentation (route transitions / full-page
 * boundaries). Wraps the same Lottie asset RouteLoading previously inlined
 * directly — keep the dynamic-import reasoning above if you touch this.
 */
export function SpinnerPanel({ label = 'Yüklənir...', size = 'md', className = '' }: SpinnerPanelProps) {
  return (
    <div
      className={`glass-panel glow-primary flex flex-col items-center gap-3 rounded-3xl px-10 py-8 ${className}`}
    >
      <div className={`overflow-hidden rounded-xl ${PANEL_SIZES[size]}`}>
        <Lottie animationData={loadingAnimation} loop autoplay />
      </div>
      <span className="mono-label uppercase text-on-surface-variant">{label}</span>
    </div>
  );
}
