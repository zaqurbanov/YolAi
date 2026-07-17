'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeftIcon } from '@/components/icons';

// Mobile-only: desktop already has the sidebar nav plus real browser back,
// this exists so an installed PWA (no browser chrome once `display:
// standalone`) still has an obvious way back a level.
export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/') return null;

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center justify-center rounded-lg p-2 text-muted hover:bg-surface-hover hover:text-foreground md:hidden"
      aria-label="Geri"
    >
      <ArrowLeftIcon />
    </button>
  );
}
