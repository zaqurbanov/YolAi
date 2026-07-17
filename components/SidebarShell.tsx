'use client';

import type { ReactNode } from 'react';
import { Drawer } from '@heroui/react';
import { useSidebar } from '@/components/SidebarContext';

// Fixed-width inner wrapper + collapsing outer <aside> is the standard
// collapsible-sidebar pattern: animating width directly on a flex/auto-width
// element makes content reflow/wrap mid-transition, so the inner div stays a
// constant 14rem and the outer element clips it down to 0. This is
// desktop-only (`md:` prefixed); below `md` the same content renders instead
// as a left-side overlay Drawer (see below), sharing `isOpen`/`toggle` from
// SidebarContext rather than a second piece of state.
export function SidebarShell({ children }: { children: ReactNode }) {
  const { isOpen, isMobile, close } = useSidebar();

  return (
    <>
      <aside
        className={`hidden md:flex md:shrink-0 md:flex-col md:min-h-0 md:overflow-hidden border-r bg-surface transition-[width] duration-200 ${
          isOpen ? 'md:w-56 border-border' : 'md:w-0 border-transparent'
        }`}
      >
        <div className="flex h-full w-56 flex-col min-h-0 overflow-y-auto">{children}</div>
      </aside>

      <Drawer.Backdrop
        isOpen={isOpen && isMobile}
        onOpenChange={(open) => {
          if (!open) close();
        }}
        variant="blur"
        className="md:hidden"
      >
        <Drawer.Content placement="left" className="md:hidden">
          <Drawer.Dialog className="glass-panel h-full w-72 max-w-[80vw] flex-col gap-0 rounded-r-2xl border-r border-border p-0">
            <div className="flex h-full flex-col min-h-0 overflow-y-auto">{children}</div>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
  );
}
