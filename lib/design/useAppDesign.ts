'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DESIGN_COOKIE_NAME } from './constants';

const DESIGN_KEY = DESIGN_COOKIE_NAME;
const DESIGN_CHANGED_EVENT = 'yol-design-changed';

// Second, independent visual-design toggle — separate from useDarkMode (which
// only ever flips `dark`/light within the ONE existing "sadə dizayn" system).
// This one switches between two entirely different design systems:
//   - `data-design` absent or "simple" -> existing LegalDrive HUD (untouched)
//   - `data-design="3d"`               -> new "Cyber-Circuit Legal" HUD
// Mirrors useDarkMode.ts's shape/pattern deliberately (undecided-until-mounted
// state synced from the DOM, localStorage persistence, a same-tab custom event
// so every mounted instance — NavBar toggle, home page switcher — stays in
// sync without a page reload) so the two toggles behave identically and don't
// interfere with each other; they read/write different attributes and keys.
export function useAppDesign() {
  const router = useRouter();
  const [is3D, setIs3D] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIs3D(document.documentElement.getAttribute('data-design') === '3d');

    function handleExternalChange(e: Event) {
      setIs3D((e as CustomEvent<{ is3D: boolean }>).detail.is3D);
    }
    window.addEventListener(DESIGN_CHANGED_EVENT, handleExternalChange);
    return () => window.removeEventListener(DESIGN_CHANGED_EVENT, handleExternalChange);
  }, []);

  const setDesign3D = useCallback((next: boolean) => {
    const value = next ? '3d' : 'simple';
    // Cookie is the source of truth every one of the 8 pages reads
    // server-side (lib/design/getServerDesign.ts) to decide which tree to
    // render — this is what actually makes the switch "stick" across
    // reloads/navigations with no flash. router.refresh() below re-runs the
    // current page's server component so it picks up the new cookie value
    // immediately, without a full document reload.
    document.cookie = `${DESIGN_COOKIE_NAME}=${value}; path=/; max-age=31536000; samesite=lax`;
    // Kept in sync for the pre-paint inline script in app/layout.tsx, which
    // runs before any request round-trip can happen and can't read a cookie
    // set this same tick reliably faster than it can read localStorage.
    localStorage.setItem(DESIGN_KEY, value);
    document.documentElement.setAttribute('data-design', value);
    setIs3D(next);
    window.dispatchEvent(new CustomEvent(DESIGN_CHANGED_EVENT, { detail: { is3D: next } }));
    router.refresh();

    // The 3D design is dark-only by product decision (no light variant was
    // ever designed) — switching into it forces dark mode on, without
    // touching the stored `yol-theme` preference, so "sadə dizayn"'s
    // light/dark choice is exactly as the user left it when they switch
    // back. Mirrors the same rule enforced on initial load by
    // THEME_AND_DESIGN_INIT_SCRIPT in app/layout.tsx, and by
    // lib/theme/useDarkMode.ts's setDark (which refuses to go light while
    // `data-design` is "3d") for the reverse direction — belt and braces so
    // there is no path, load or toggle, that leaves 3D+light active.
    if (next) {
      document.documentElement.classList.add('dark');
      window.dispatchEvent(new CustomEvent('yol-theme-changed', { detail: { isDark: true } }));
    } else {
      const storedTheme = localStorage.getItem('yol-theme');
      const restoredDark = storedTheme !== 'light';
      document.documentElement.classList.toggle('dark', restoredDark);
      window.dispatchEvent(new CustomEvent('yol-theme-changed', { detail: { isDark: restoredDark } }));
    }
  }, [router]);

  return { is3D, setDesign3D };
}
