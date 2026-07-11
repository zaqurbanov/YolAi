'use client';

import { useEffect, useState } from 'react';
import { ToggleButton } from '@heroui/react';
import { MoonIcon, SunIcon } from '@/components/icons';

const THEME_KEY = 'yol-theme';

export default function ThemeToggle() {
  // Real DOM state may already differ from any default we'd guess here (the
  // no-FOUC inline script in app/layout.tsx sets the class before hydration),
  // so this starts undecided and syncs from the DOM on mount rather than
  // assuming a value.
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    // Deliberate: syncing external DOM state (set by the no-FOUC inline
    // script in app/layout.tsx before hydration) into React state on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains('dark'));
  }, []);

  function handleChange(nextIsDark: boolean) {
    document.documentElement.classList.toggle('dark', nextIsDark);
    localStorage.setItem(THEME_KEY, nextIsDark ? 'dark' : 'light');
    setIsDark(nextIsDark);
  }

  if (isDark === null) {
    // Avoid rendering a guessed icon before we've read the real class state.
    return <div className="size-9" aria-hidden="true" />;
  }

  return (
    <ToggleButton
      isSelected={isDark}
      onChange={handleChange}
      isIconOnly
      variant="ghost"
      aria-label={isDark ? 'İşıqlı temaya keç' : 'Qaranlıq temaya keç'}
      className="rounded-lg text-muted hover:bg-surface-hover hover:text-foreground"
    >
      {isDark ? <MoonIcon /> : <SunIcon />}
    </ToggleButton>
  );
}
