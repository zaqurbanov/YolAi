'use client';

import Link from 'next/link';
import { useState, type CSSProperties } from 'react';
import { Avatar, Popover } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { logout } from '@/app/(auth)/actions';
import { useNavState } from '@/components/useNavState';
import { useTour } from '@/components/onboarding/TourProvider';
import { useDarkMode } from '@/lib/theme/useDarkMode';
import InstallAppButton from '@/components/InstallAppButton';
import { CoinIcon, MoonIcon, PlusIcon, SunIcon } from '@/components/icons';

function initialsFrom(name: string | null | undefined, email: string | null): string {
  const source = name?.trim() || email || '';
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

// Per-user avatar colour. Keyed on the immutable auth user id (not the email or
// display name) so the colour a user learns to recognise never changes under
// them when they edit their profile. FNV-1a over the id → a hue; saturation and
// lightness are fixed so every generated colour clears contrast against both
// themes' surfaces and no user can land on an unreadably pale or dark chip.
function accentForUser(userId: string): { accent: string; soft: string } {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const hue = Math.abs(hash) % 360;
  return {
    accent: `hsl(${hue} 68% 55%)`,
    soft: `hsl(${hue} 68% 55% / 0.45)`,
  };
}

/**
 * The single account/overflow menu in the navbar, at every breakpoint. It
 * absorbed the former NavBarMenu ("3-dot") menu — one trigger instead of two
 * adjacent ones — so it carries the mobile-only cluster (coin link, theme,
 * design toggle) alongside the account actions. Items marked `sm:hidden` have a
 * dedicated navbar control on sm+ and would otherwise be duplicated.
 */
export default function MobileAccountMenu() {
  const nav = useNavState();
  const [isOpen, setIsOpen] = useState(false);
  const { start: startTour } = useTour();
  const { isDark, setDark } = useDarkMode();

  if (!nav?.user) return null;

  const itemClass = `${buttonVariants({ variant: 'ghost', size: 'sm' })} w-full justify-start gap-2 text-sm font-medium`;
  const closeMenu = () => setIsOpen(false);

  const displayName = nav.user.fullName || nav.user.email?.split('@')[0] || 'İstifadəçi';
  const { accent, soft } = accentForUser(nav.user.id);
  const accentVars = {
    '--avatar-accent': accent,
    '--avatar-accent-soft': soft,
  } as CSSProperties;

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger
        aria-label="Hesab və menyu"
        className="flex items-center gap-2 shrink-0 rounded-full p-1 outline-none transition hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        {/* The pulse lives on this wrapper, not on Avatar itself: HeroUI's
            Avatar owns its own box-shadow/ring styles and the animation would
            fight them. motion-reduce disables the loop per the app-wide rule. */}
        <span
          style={accentVars}
          className="avatar-pulse inline-flex motion-reduce:animate-none"
        >
          <Avatar
            size="sm"
            style={{ borderColor: accent }}
            className="border-2 transition-opacity hover:opacity-80"
          >
            {nav.user.avatarUrl ? <Avatar.Image src={nav.user.avatarUrl} alt="Profil şəkli" /> : null}
            <Avatar.Fallback style={{ backgroundColor: accent, color: '#fff' }}>
              {initialsFrom(nav.user.fullName, nav.user.email)}
            </Avatar.Fallback>
          </Avatar>
        </span>
        <span className="hidden xs:inline-block max-w-[100px] truncate text-xs font-semibold text-foreground">
          {displayName}
        </span>
      </Popover.Trigger>
      <Popover.Content
        placement="bottom end"
        className="min-w-[200px] rounded-xl border border-border bg-surface p-2 shadow-xl backdrop-blur-xl"
      >
        <Popover.Dialog>
          <div className="flex flex-col gap-1">
            <div className="px-2 py-1.5 border-b border-border/60 mb-1">
              <p className="text-xs font-bold text-foreground truncate">{displayName}</p>
              {nav.user.email && <p className="text-[10px] text-muted-foreground truncate">{nav.user.email}</p>}
            </div>

            {!nav.isAdmin && (
              <Link href="/coin-qazan" className={`${itemClass} sm:hidden`} onClick={closeMenu}>
                <CoinIcon width={16} height={16} />
                Coin qazan
              </Link>
            )}

            {isDark !== null && (
              <button
                type="button"
                className={`${itemClass} sm:hidden`}
                onClick={() => {
                  setDark(!isDark);
                  closeMenu();
                }}
              >
                {isDark ? (
                  <SunIcon width={16} height={16} className="text-amber-400" />
                ) : (
                  <MoonIcon width={16} height={16} className="text-slate-400" />
                )}
                <span>{isDark ? 'İşıqlı tema' : 'Qaranlıq tema'}</span>
              </button>
            )}

            <Link href="/chat" className={itemClass} onClick={closeMenu}>
              Chat
            </Link>

            {/* "Bizə yazın" lives in the desktop sidebar footer; on mobile that
                sidebar is hidden, so this popover (present at every breakpoint)
                is where the /sual shortcut must also live to stay reachable. */}
            <Link href="/sual" className={itemClass} onClick={closeMenu}>
              <PlusIcon width={16} height={16} />
              Bizə yazın
            </Link>

            {nav.isAdmin && (
              <Link href="/admin" className={itemClass} onClick={closeMenu}>
                Admin
              </Link>
            )}

            <Link href="/account" className={itemClass} onClick={closeMenu}>
              Hesab
            </Link>

            {/* The install button previously only existed in the sidebar footer,
                and the sidebar's toggle is `hidden md:inline-flex` — so on
                mobile, the one place a PWA install actually matters, it was
                unreachable. It renders nothing when the app is already
                installed or the browser can't offer an install.

                Deliberately does NOT call closeMenu: its iOS/Android fallback
                modals live inside the component, and closing the popover would
                unmount them before they could show. */}
            <InstallAppButton className={itemClass} />

            <button
              type="button"
              className={itemClass}
              onClick={() => {
                closeMenu();
                startTour();
              }}
            >
              Turu yenidən göstər
            </button>

            <form action={logout} onSubmit={closeMenu}>
              <button
                type="submit"
                className={`${itemClass} text-rose-500 hover:text-rose-400 hover:bg-rose-500/10`}
              >
                Çıxış
              </button>
            </form>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
