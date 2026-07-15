'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const SIDEBAR_KEY = 'yol-sidebar-open';
const MOBILE_QUERY = '(max-width: 767px)';

interface SidebarContextValue {
  isOpen: boolean;
  isMobile: boolean;
  toggle: () => void;
  close: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  // Defaults open so SSR/first paint matches the pre-existing always-open
  // desktop layout; any closed preference from a prior visit is applied right
  // after mount, same pattern as ThemeToggle's DOM-state sync. Mobile is
  // corrected to closed in the effect below regardless of that preference,
  // since on mobile this state drives an overlay drawer (per-visit), not a
  // persistent collapsible panel.
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);

    function sync(matches: boolean) {
      setIsMobile(matches);
      if (matches) {
        setIsOpen(false);
      } else {
        const stored = localStorage.getItem(SIDEBAR_KEY);
        setIsOpen(stored !== 'closed');
      }
    }

    sync(mql.matches);
    const listener = (e: MediaQueryListEvent) => sync(e.matches);
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, []);

  function toggle() {
    setIsOpen((prev) => {
      const next = !prev;
      // Only the desktop inline-collapse state is a persisted preference; the
      // mobile drawer is a per-visit overlay and shouldn't leak a "closed"
      // preference into the next desktop session (or vice versa).
      if (!isMobile) {
        localStorage.setItem(SIDEBAR_KEY, next ? 'open' : 'closed');
      }
      return next;
    });
  }

  function close() {
    setIsOpen(false);
  }

  return (
    <SidebarContext.Provider value={{ isOpen, isMobile, toggle, close }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}
