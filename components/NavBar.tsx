'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { buttonVariants } from '@heroui/styles';
import { SidebarToggleButton } from '@/components/SidebarToggleButton';
import { BackButton } from '@/components/BackButton';
import CoinBadge from '@/components/CoinBadge';
import NotificationBell from '@/components/NotificationBell';
import MobileAccountMenu from '@/components/MobileAccountMenu';
import ThemeToggle from '@/components/ThemeToggle';
import { CoinIcon } from '@/components/icons';
import { useNavState } from '@/components/useNavState';

// Mobile-only section labels. This bar is the single top navigation bar on
// mobile for every route (see the note on the title span below), so it has to
// say where you are — on desktop the sidebar already does that job, which is
// why these are `sm:hidden`. Ordered longest-prefix-first; `/` falls through to
// the brand wordmark instead of a label.
const MOBILE_SECTION_TITLES: ReadonlyArray<readonly [string, string]> = [
  ['/oyrenme', 'Akademiya'],
  ['/coin-qazan', 'Coin Qazan'],
  ['/imtahan', 'Rəsmi İmtahan'],
  ['/qiymetler', 'Qiymətlər'],
  ['/account', 'Hesab'],
  ['/admin', 'Admin'],
  ['/chat', 'AI Chat'],
  ['/sual', 'Sual'],
  ['/faq', 'FAQ'],
];

export default function NavBar() {
  const nav = useNavState();
  const pathname = usePathname();
  const logoUrl = nav?.logoUrl ?? '/logo.png';

  const mobileTitle =
    MOBILE_SECTION_TITLES.find(
      ([prefix]) => pathname === prefix || pathname?.startsWith(`${prefix}/`),
    )?.[1] ?? null;

  return (
    <nav className="hud-navbar sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-outline-variant/30 bg-surface/80 px-3 py-3 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <BackButton />
        <span className="hidden md:inline-flex">
          <SidebarToggleButton />
        </span>
        <Link href="/" className="flex min-w-0 items-center gap-2 font-semibold whitespace-nowrap">
          {logoUrl === '/logo.png' ? (
            <span className="flex shrink-0 items-center justify-center rounded-md bg-white p-0.5 shadow-sm">
              <Image src={logoUrl} alt="Yol Hərəkəti QA logo" width={36} height={32} className="object-contain" />
            </span>
          ) : (
            <Image
              src={logoUrl}
              alt="Yol Hərəkəti QA logo"
              width={36}
              height={32}
              unoptimized
              className="shrink-0 object-contain"
            />
          )}
          <span className="hidden text-base font-bold text-foreground sm:inline">Yol Hərəkəti QA</span>
        </Link>
        {/* Replaces the wordmark on mobile: the per-screen <header> elements
            that used to carry a section title were removed so this bar is the
            only top bar on mobile — without a label every screen would look
            identical above the fold. Dynamic titles (conversation name, course
            name) deliberately stay in page content, not here. */}
        {mobileTitle && (
          <span className="truncate text-base font-bold text-foreground sm:hidden">{mobileTitle}</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5 text-sm sm:gap-2">
        {nav === null ? (
          <span aria-hidden className="h-8 w-16 rounded-full bg-surface-hover/40 sm:w-40" />
        ) : (
          <>
            {nav.user && !nav.isAdmin && (
              <Link
                href="/coin-qazan"
                data-tour="coin-qazan-link"
                className="glass-card mono-label hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-on-surface transition-colors hover:bg-surface-tertiary/60 sm:flex"
              >
                <CoinIcon width={14} height={14} />
                <span>Coin qazan</span>
              </Link>
            )}
            {nav.user && !nav.isAdmin && <CoinBadge />}
            {nav.user && (
              <NotificationBell
                initialUnreadCount={nav.unreadCount}
                initialNotifications={nav.notifications}
              />
            )}
          </>
        )}
        <span className="hidden sm:inline-flex">
          <ThemeToggle />
        </span>
        {/* The avatar menu is the only overflow trigger now — the separate
            3-dot NavBarMenu that used to sit beside it was folded into it.
            Logged-out visitors have no avatar, so the one action that menu
            offered them (login) is a plain button here. */}
        {nav?.user && <MobileAccountMenu />}
        {nav !== null && !nav.user && (
          <Link
            href="/login"
            className={buttonVariants({ variant: 'primary', size: 'sm' })}
          >
            Daxil ol
          </Link>
        )}
      </div>
    </nav>
  );
}
