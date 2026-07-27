'use client';

import Link from 'next/link';
import { useState } from 'react';
import { buttonVariants } from '@heroui/styles';
import { Popover } from '@heroui/react';
import { logout } from '@/app/(auth)/actions';
import { CoinIcon, CubeIcon, MoonIcon, MoreIcon, SunIcon } from '@/components/icons';
import { useTour } from '@/components/onboarding/TourProvider';
import { useDarkMode } from '@/lib/theme/useDarkMode';
import { useAppDesign } from '@/lib/design/useAppDesign';

interface NavBarMenuProps {
  hasUser: boolean;
  isAdmin: boolean;
}

// Client wrapper around the navbar's overflow menu (Popover needs open/close
// state + interactivity). NavBar itself stays a server component; this
// mirrors CoinBadge/NotificationBell's pattern of a small client child fed
// precomputed booleans from the server-rendered parent, rather than making
// the whole nav a client component.
export default function NavBarMenu({ hasUser, isAdmin }: NavBarMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const closeMenu = () => setIsOpen(false);
  const { start: startTour } = useTour();
  const { isDark, setDark } = useDarkMode();
  const { is3D, setDesign3D } = useAppDesign();

  const ghostItem = `${buttonVariants({ variant: 'ghost', size: 'sm' })} w-full justify-start`;
  const secondaryItem = `${buttonVariants({ variant: 'secondary', size: 'sm' })} w-full justify-start`;
  const primaryItem = `${buttonVariants({ variant: 'primary', size: 'sm' })} w-full justify-start`;

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger
        aria-label="Daha çox"
        className="rounded-full p-2 transition hover:bg-surface-hover hover:text-on-surface"
      >
        <MoreIcon />
      </Popover.Trigger>
      <Popover.Content
        placement="bottom end"
        className="min-w-[180px] rounded-xl border border-border bg-surface p-1 shadow-lg"
      >
        <Popover.Dialog>
          <div className="flex flex-col gap-1">
            {/* Mobile-only cluster: these two sit in the navbar on sm+ screens
                and move into this menu on mobile to keep the navbar uncluttered
                (see NavBar.tsx). Hidden on sm+ so they aren't duplicated. */}
            {hasUser && !isAdmin && (
              <Link href="/coin-qazan" className={`${ghostItem} gap-2 sm:hidden`} onClick={closeMenu}>
                <CoinIcon width={16} height={16} />
                Coin qazan
              </Link>
            )}
            {isDark !== null && (
              <button
                type="button"
                className={`${ghostItem} gap-2 sm:hidden`}
                onClick={() => setDark(!isDark)}
              >
                {isDark ? <SunIcon width={16} height={16} /> : <MoonIcon width={16} height={16} />}
                {isDark ? 'İşıqlı tema' : 'Qaranlıq tema'}
              </button>
            )}
            {is3D !== null && (
              <button
                type="button"
                className={`${ghostItem} gap-2 sm:hidden`}
                onClick={() => setDesign3D(!is3D)}
              >
                <CubeIcon width={16} height={16} />
                {is3D ? 'Sadə dizayna qayıt' : 'Yeni dizayna keç'}
              </button>
            )}
            {hasUser && (
              <Link href="/chat" className={ghostItem} onClick={closeMenu}>
                Chat
              </Link>
            )}
            {isAdmin && (
              <Link href="/admin" className={ghostItem} onClick={closeMenu}>
                Admin
              </Link>
            )}
            {hasUser ? (
              <>
                <Link href="/account" className={ghostItem} onClick={closeMenu}>
                  Hesab
                </Link>
                <button
                  type="button"
                  className={ghostItem}
                  onClick={() => {
                    closeMenu();
                    startTour();
                  }}
                >
                  Turu yenidən göstər
                </button>
                <form action={logout} onSubmit={closeMenu}>
                  <button type="submit" className={secondaryItem}>
                    Çıxış
                  </button>
                </form>
              </>
            ) : (
              <>
                <Link href="/login" className={ghostItem} onClick={closeMenu}>
                  Daxil ol
                </Link>
                <Link href="/signup" className={primaryItem} onClick={closeMenu}>
                  Qeydiyyat
                </Link>
              </>
            )}
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
