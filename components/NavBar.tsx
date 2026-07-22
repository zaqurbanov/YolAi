'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Avatar } from '@heroui/react';
import { SidebarToggleButton } from '@/components/SidebarToggleButton';
import { BackButton } from '@/components/BackButton';
import CoinBadge from '@/components/CoinBadge';
import NotificationBell from '@/components/NotificationBell';
import NavBarMenu from '@/components/NavBarMenu';
import ThemeToggle from '@/components/ThemeToggle';
import { CoinIcon } from '@/components/icons';
import { useNavState } from '@/components/useNavState';

// Client component on purpose. It used to be an async server component
// calling createClient() -> cookies(), and because it renders in the ROOT
// layout that forced EVERY page in the app to render dynamically — including
// pages with no auth needs, which is expensive against the Vercel Hobby
// serverless-function cap (see CLAUDE.md). Fetching the same data after mount
// keeps one nav implementation instead of forking a static-only variant.
// Same rule as app/account/page.tsx's avatar fallback: first letters of the
// display name, or of the email when no name is set.
function initialsFrom(name: string | null | undefined, email: string | null): string {
  const source = name?.trim() || email || '';
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function NavBar() {
  const nav = useNavState();
  const logoUrl = nav?.logoUrl ?? '/logo.png';

  return (
    <nav className="border-b px-3 py-3 flex items-center justify-between gap-2 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <BackButton />
        <SidebarToggleButton />
        <Link href="/" className="flex items-center gap-2 font-semibold whitespace-nowrap shrink-0">
          {/* White chip only for the static /logo.png fallback (an opaque
              PNG with no alpha channel) — an admin-uploaded logo is assumed
              to already have an appropriate (usually transparent)
              background, so wrapping it in a forced white box would fight
              its own design instead of fixing anything. */}
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
          {/* Hidden below sm: on a narrow phone, back button + sidebar
              toggle + logo + wordmark + the right-side icon cluster don't
              all fit in one row and overflow — dropping the wordmark (the
              logo mark alone is still enough of a brand cue) is the
              cheapest fix, matching the same md:hidden/sm:hidden pattern
              this app already uses elsewhere for mobile-vs-desktop splits. */}
          <span className="hidden sm:inline">Yol Hərəkəti QA</span>
        </Link>
      </div>
      <div className="flex shrink-0 items-center gap-1 text-sm sm:gap-2">
        {/* Nothing auth-dependent renders until nav state is known — a fixed
            min-width placeholder holds the slot so the icon cluster doesn't
            shift when it resolves. */}
        {nav === null ? (
          <span aria-hidden className="h-8 w-16 rounded-full bg-surface-hover/40 sm:w-40" />
        ) : (
          <>
            {nav.user && !nav.isAdmin && (
              <Link
                href="/coin-qazan"
                data-tour="coin-qazan-link"
                className="glass-card mono-label flex items-center gap-1.5 rounded-full px-3 py-1.5 text-on-surface transition-colors hover:bg-surface-tertiary/60"
              >
                <CoinIcon width={14} height={14} />
                <span className="hidden sm:inline">Coin qazan</span>
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
        <ThemeToggle />
        {nav?.user && (
          <Link
            href="/account"
            aria-label="Hesab menyusu"
            title="Hesab"
            className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <Avatar size="sm" className="ring-1 ring-primary/30 transition-opacity hover:opacity-80">
              {nav.user.avatarUrl ? (
                <Avatar.Image src={nav.user.avatarUrl} alt="Profil şəkli" />
              ) : null}
              <Avatar.Fallback>{initialsFrom(nav.user.fullName, nav.user.email)}</Avatar.Fallback>
            </Avatar>
          </Link>
        )}
        {nav !== null && <NavBarMenu hasUser={!!nav.user} isAdmin={nav.isAdmin} />}
      </div>
    </nav>
  );
}
