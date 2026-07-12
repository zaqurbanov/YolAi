'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const SIDEBAR_KEY = 'yol-sidebar-open';

interface SidebarContextValue {
  isOpen: boolean;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
  // Defaults open so SSR/first paint matches the pre-existing always-open
  // layout; any closed preference from a prior visit is applied right after
  // mount, same pattern as ThemeToggle's DOM-state sync.
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    if (stored === 'closed') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing persisted preference on mount
      setIsOpen(false);
    }
  }, []);

  function toggle() {
    setIsOpen((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, next ? 'open' : 'closed');
      return next;
    });
  }

  return <SidebarContext.Provider value={{ isOpen, toggle }}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}
