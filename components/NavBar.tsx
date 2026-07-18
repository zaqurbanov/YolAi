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
    <nav className="border-b px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
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
          Yol Hərəkəti QA
        </Link>
      </div>
      <div className="flex items-center gap-2 text-sm">
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
