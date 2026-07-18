'use client';

import { ToggleButton } from '@heroui/react';
import { MoonIcon, SunIcon } from '@/components/icons';
import { useDarkMode } from '@/lib/theme/useDarkMode';

export default function ThemeToggle() {
  const { isDark, setDark } = useDarkMode();

  if (isDark === null) {
    // Avoid rendering a guessed icon before we've read the real class state.
    return <div className="size-9" aria-hidden="true" />;
  }

  return (
    <ToggleButton
      isSelected={isDark}
      onChange={setDark}
      isIconOnly
      variant="ghost"
      aria-label={isDark ? 'İşıqlı temaya keç' : 'Qaranlıq temaya keç'}
      className="rounded-lg text-muted hover:bg-surface-hover hover:text-foreground"
    >
      {isDark ? <MoonIcon /> : <SunIcon />}
    </ToggleButton>
  );
}
