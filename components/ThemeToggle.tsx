'use client';

import { ToggleButton } from '@heroui/react';
import { MoonIcon, SunIcon } from '@/components/icons';
import { useDarkMode } from '@/lib/theme/useDarkMode';
import { useAppDesign } from '@/lib/design/useAppDesign';

export default function ThemeToggle() {
  const { isDark, setDark } = useDarkMode();
  const { is3D } = useAppDesign();

  if (isDark === null) {
    // Avoid rendering a guessed icon before we've read the real class state.
    return <div className="size-9" aria-hidden="true" />;
  }

  // The 3D design is dark-only (no light variant exists) — disabled rather
  // than hidden, so it's visible that the control still exists but is
  // locked, not just missing. useDarkMode's setDark also refuses a
  // light-while-3D request defensively, but disabling here is the primary UX.
  return (
    <ToggleButton
      isSelected={isDark}
      onChange={setDark}
      isDisabled={is3D === true}
      isIconOnly
      variant="ghost"
      aria-label={is3D ? 'Yeni dizaynda yalnız qaranlıq rejim aktivdir' : isDark ? 'İşıqlı temaya keç' : 'Qaranlıq temaya keç'}
      className="rounded-lg text-muted hover:bg-surface-hover hover:text-foreground"
    >
      {isDark ? <MoonIcon /> : <SunIcon />}
    </ToggleButton>
  );
}
