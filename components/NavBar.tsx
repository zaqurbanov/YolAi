import Link from 'next/link';
import { buttonVariants } from '@heroui/styles';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/app/(auth)/actions';
import { SidebarToggleButton } from '@/components/SidebarToggleButton';
import CoinBadge from '@/components/CoinBadge';

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

  return (
    <nav className="border-b px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <SidebarToggleButton />
        <Link href="/" className="font-semibold">
          Yol Hərəkəti QA
        </Link>
      </div>
      <div className="flex items-center gap-2 text-sm">
        {user && (
          <Link href="/chat" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Chat
          </Link>
        )}
        {isAdmin && (
          <Link href="/admin" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
            Admin
          </Link>
        )}
        {user ? (
          <>
            {!isAdmin && <CoinBadge />}
            <Link href="/account" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Hesab
            </Link>
            <form action={logout}>
              <button type="submit" className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                Çıxış
              </button>
            </form>
          </>
        ) : (
          <>
            <Link href="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Daxil ol
            </Link>
            <Link href="/signup" className={buttonVariants({ variant: 'primary', size: 'sm' })}>
              Qeydiyyat
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
