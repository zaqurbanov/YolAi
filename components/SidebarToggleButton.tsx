'use client';

import { useSidebar } from '@/components/SidebarContext';
import { MenuIcon } from '@/components/icons';

export function SidebarToggleButton() {
  const { toggle } = useSidebar();

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex items-center justify-center rounded-lg p-2 text-muted hover:bg-surface-hover hover:text-foreground"
      aria-label="Sidebar-ı aç/bağla"
    >
      <MenuIcon />
    </button>
  );
}
