'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const MOBILE_QUERY = '(max-width: 767px)';

interface SidebarContextValue {
  isOpen: boolean;
  isMobile: boolean;
  toggle: () => void;
  close: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  // Desktop sidebar always opens by default — it's the primary navigation on
  // large screens, so a prior visit's collapsed state is not remembered; every
  // visit starts with it open (the toggle still works within the session).
  // Mobile is corrected to closed in the effect below, since there this state
  // drives an overlay drawer (per-visit), not a persistent collapsible panel.
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);

    function sync(matches: boolean) {
      setIsMobile(matches);
      setIsOpen(!matches); // desktop always open; mobile closed (overlay drawer)
    }

    sync(mql.matches);
    const listener = (e: MediaQueryListEvent) => sync(e.matches);
    mql.addEventListener('change', listener);
    return () => mql.removeEventListener('change', listener);
  }, []);

  function toggle() {
    setIsOpen((prev) => !prev);
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
