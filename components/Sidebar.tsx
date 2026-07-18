import Link from 'next/link';
import Image from 'next/image';
import { buttonVariants } from '@heroui/styles';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/app/(auth)/actions';
import { SidebarNav } from '@/components/SidebarNav';
import { SidebarShell } from '@/components/SidebarShell';
import { ChatConversationList } from '@/components/ChatConversationList';
import { PlusIcon } from '@/components/icons';
import InstallAppButton from '@/components/InstallAppButton';
import { getSiteLogoUrl } from '@/lib/content/getSiteLogoUrl';

const NAV_ITEMS = [
  { href: '/', label: 'Ana Səhifə', icon: 'home' as const },
  { href: '/chat', label: 'Söhbət', icon: 'chat' as const },
  { href: '/qaydalar', label: 'Qaydalar', icon: 'rules' as const },
  { href: '/account', label: 'Ayarlar', icon: 'settings' as const },
];

export default async function Sidebar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isAdmin = false;
  if (user) {
    const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (error) console.error('[Sidebar] profiles query failed', error);
    isAdmin = profile?.role === 'admin';
  }

  const logoUrl = (await getSiteLogoUrl()) ?? '/logo.png';

  // "Ayarlar" links to /account, which requires auth (redirects to /login
  // otherwise) — hide it for logged-out visitors instead of sending them into
  // a redirect. The separate "Hesabım" link (same destination) was removed
  // as a duplicate — "Ayarlar" above is the only nav entry for /account now.
  const navItems = user ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.href !== '/account');

  return (
    <SidebarShell>
      <Link href="/" className="flex items-center gap-3 px-5 py-5">
        {/* White chip only for the static /logo.png fallback (an opaque PNG
            with no alpha channel) — an admin-uploaded logo is assumed to
            already have an appropriate (usually transparent) background. */}
        {logoUrl === '/logo.png' ? (
          <span className="flex shrink-0 items-center justify-center rounded-lg bg-white p-1 shadow-sm">
            <Image src={logoUrl} alt="Yol Hərəkəti QA logo" width={40} height={36} className="object-contain" />
          </span>
        ) : (
          <Image
            src={logoUrl}
            alt="Yol Hərəkəti QA logo"
            width={40}
            height={36}
            unoptimized
            className="shrink-0 object-contain"
          />
        )}
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-foreground">Yol Hərəkəti QA</span>
          <span className="text-xs text-muted">Hüquqi AI köməkçi</span>
        </div>
      </Link>

      <SidebarNav items={navItems} />

      {user && <ChatConversationList />}

      <div className="mt-4 flex flex-col gap-1 px-3">
        {isAdmin && (
          <Link
            href="/admin"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
          >
            Admin
          </Link>
        )}
        {user ? (
          <>
            <form action={logout}>
              <button
                type="submit"
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
              >
                Çıxış
              </button>
            </form>
          </>
        ) : (
          <>
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
            >
              Daxil ol
            </Link>
            <Link
              href="/signup"
              className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
            >
              Qeydiyyat
            </Link>
          </>
        )}
      </div>

      <div className="mt-auto flex flex-col gap-2 p-4">
        <InstallAppButton />
        <Link href="/sual" className={buttonVariants({ variant: 'primary', size: 'md' }) + ' w-full justify-center gap-2'}>
          <PlusIcon className="shrink-0" />
          Bizə yazın
        </Link>
      </div>
    </SidebarShell>
  );
}
