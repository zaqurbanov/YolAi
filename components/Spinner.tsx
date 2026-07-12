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
 * route-transition loading state, use `RouteLoading` instead.
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
