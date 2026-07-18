import Link from 'next/link';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/server';
import { SidebarToggleButton } from '@/components/SidebarToggleButton';
import { BackButton } from '@/components/BackButton';
import CoinBadge from '@/components/CoinBadge';
import NotificationBell from '@/components/NotificationBell';
import NavBarMenu from '@/components/NavBarMenu';
import ThemeToggle from '@/components/ThemeToggle';
import { getUnreadCount, getRecentNotifications } from '@/lib/notifications/notifications';
import { getSiteLogoUrl } from '@/lib/content/getSiteLogoUrl';

export default async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const logoUrl = (await getSiteLogoUrl()) ?? '/logo.png';

  let isAdmin = false;
  if (user) {
    const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (error) console.error('[NavBar] profiles query failed', error);
    isAdmin = profile?.role === 'admin';
  }

  const [unreadCount, recentNotifications] = user
    ? await Promise.all([getUnreadCount(user.id), getRecentNotifications(user.id)])
    : [0, []];

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
        {user && !isAdmin && <CoinBadge />}
        {user && (
          <NotificationBell
            initialUnreadCount={unreadCount}
            initialNotifications={recentNotifications}
          />
        )}
        <ThemeToggle />
        <NavBarMenu hasUser={!!user} isAdmin={isAdmin} />
      </div>
    </nav>
  );
}
