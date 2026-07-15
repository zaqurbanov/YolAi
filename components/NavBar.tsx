import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { SidebarToggleButton } from '@/components/SidebarToggleButton';
import CoinBadge from '@/components/CoinBadge';
import NotificationBell from '@/components/NotificationBell';
import NavBarMenu from '@/components/NavBarMenu';
import { getUnreadCount, getRecentNotifications } from '@/lib/notifications/notifications';

export default async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
        <SidebarToggleButton />
        <Link href="/" className="font-semibold whitespace-nowrap shrink-0">
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
        <NavBarMenu hasUser={!!user} isAdmin={isAdmin} />
      </div>
    </nav>
  );
}
