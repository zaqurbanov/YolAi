'use client';

import { useCallback, useEffect, useState } from 'react';

const THEME_KEY = 'yol-theme';
const THEME_CHANGED_EVENT = 'yol-theme-changed';

// Single source of truth for dark-mode state, shared by every UI that can
// toggle it (NavBar's icon, the account page's "Tərcihlər" switch) so they
// never drift out of sync while both are mounted at once. Toggling from
// either dispatches THEME_CHANGED_EVENT; every instance of this hook listens
// and updates its own state, instead of each control owning an independent
// copy that only happened to agree because they read the same DOM class on
// mount.
export function useDarkMode() {
  // Real DOM state may already differ from any default we'd guess here (the
  // no-FOUC inline script in app/layout.tsx sets the class before hydration),
  // so this starts undecided and syncs from the DOM on mount rather than
  // assuming a value.
  const [isDark, setIsDark] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.classList.contains('dark'));

    function handleExternalChange(e: Event) {
      setIsDark((e as CustomEvent<{ isDark: boolean }>).detail.isDark);
    }
    window.addEventListener(THEME_CHANGED_EVENT, handleExternalChange);
    return () => window.removeEventListener(THEME_CHANGED_EVENT, handleExternalChange);
  }, []);

  const setDark = useCallback((next: boolean) => {
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
    setIsDark(next);
    window.dispatchEvent(new CustomEvent(THEME_CHANGED_EVENT, { detail: { isDark: next } }));
  }, []);

  return { isDark, setDark };
}
