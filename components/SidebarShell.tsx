'use client';

import type { ReactNode } from 'react';
import { useSidebar } from '@/components/SidebarContext';

// Fixed-width inner wrapper + collapsing outer <aside> is the standard
// collapsible-sidebar pattern: animating width directly on a flex/auto-width
// element makes content reflow/wrap mid-transition, so the inner div stays a
// constant 16rem and the outer element clips it down to 0.
export function SidebarShell({ children }: { children: ReactNode }) {
  const { isOpen } = useSidebar();

  return (
    <aside
      className={`hidden md:flex md:shrink-0 md:flex-col md:min-h-0 md:overflow-hidden border-r bg-surface transition-[width] duration-200 ${
        isOpen ? 'md:w-64 border-border' : 'md:w-0 border-transparent'
      }`}
    >
      <div className="flex h-full w-64 flex-col min-h-0 overflow-y-auto">{children}</div>
    </aside>
  );
}
