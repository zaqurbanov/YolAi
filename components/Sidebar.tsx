'use client';

import Link from 'next/link';
import Image from 'next/image';
import { buttonVariants } from '@heroui/styles';
import { logout } from '@/app/(auth)/actions';
import { SidebarNav } from '@/components/SidebarNav';
import { SidebarShell } from '@/components/SidebarShell';
import { ChatConversationList } from '@/components/ChatConversationList';
import { PlusIcon } from '@/components/icons';
import InstallAppButton from '@/components/InstallAppButton';
import { useNavState, invalidateNavState } from '@/components/useNavState';

const NAV_ITEMS = [
  { href: '/', label: 'Ana Səhifə', icon: 'home' as const },
  { href: '/chat', label: 'Söhbət', icon: 'chat' as const },
  { href: '/oyrenme', label: 'Sürücülük vəsiqəsini al', icon: 'rules' as const },
  { href: '/account', label: 'Ayarlar', icon: 'settings' as const },
];

const PUBLIC_NAV_ITEMS = NAV_ITEMS.filter((item) => item.href !== '/account');

// Client component for the same reason as NavBar.tsx — it rendered in the
// root layout and its createClient() call forced every page dynamic.
export default function Sidebar() {
  const nav = useNavState();
  const logoUrl = nav?.logoUrl ?? '/logo.png';

  // "Ayarlar" links to /account, which requires auth (redirects to /login
  // otherwise) — hide it for logged-out visitors instead of sending them into
  // a redirect. While auth state is still unknown, show the public set: it's
  // the subset every visitor can use, so nothing appears and then vanishes.
  const navItems = nav?.user ? NAV_ITEMS : PUBLIC_NAV_ITEMS;

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

      {nav?.user && <ChatConversationList />}

      <div className="mt-4 flex flex-col gap-1 px-3">
        {nav?.isAdmin && (
          <Link
            href="/admin"
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
          >
            Admin
          </Link>
        )}
        {/* Auth actions stay blank until nav state resolves — showing "Daxil
            ol"/"Qeydiyyat" to someone who is already signed in is the one
            wrong state that must not appear, even briefly. */}
        {nav !== null &&
          (nav.user ? (
            <form action={logout} onSubmit={() => invalidateNavState()}>
              <button
                type="submit"
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
              >
                Çıxış
              </button>
            </form>
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
          ))}
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
