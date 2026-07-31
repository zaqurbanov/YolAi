'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';
import { GridIcon, LockIcon } from '@/components/icons';

interface TabItem {
  key: string;
  label: string;
  /** Fallback stroke icon. Used when `iconSrc` is absent. */
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /**
   * Raster icon from /public/icons — the same artwork the home page's cards
   * use, so a tab and its destination card share one image.
   */
  iconSrc?: string;
  href: string | null;
}

const TABS: TabItem[] = [
  { key: 'home', label: 'Ana səhifə', icon: GridIcon, iconSrc: '/icons/home-icon.png', href: '/' },
  { key: 'chat', label: 'AI Chat', icon: GridIcon, iconSrc: '/icons/ai-bot.png', href: '/chat' },
  {
    key: 'academy',
    label: 'Akademiya',
    icon: GridIcon,
    iconSrc: '/icons/learning-icon.png',
    href: '/oyrenme',
  },
  {
    key: 'garage',
    label: 'Coin Qazan',
    icon: GridIcon,
    iconSrc: '/icons/reward-coin.png',
    href: '/coin-qazan',
  },
  {
    key: 'exam',
    label: 'Real imtahan',
    icon: GridIcon,
    iconSrc: '/icons/exam-icon.png',
    href: '/imtahan',
  },
];

export default function MobileBottomTabBar() {
  const pathname = usePathname();

  return (
    // rounded-t-3xl detaches the bar from the screen edge so it reads as its
    // own panel rather than a band welded to the bottom.
    //
    // The active tab lifts into a raised light disc instead of the previous
    // solid-primary pill. That is not only decoration: a solid primary fill
    // made raster icons unusable here (a PNG carries its own colours and can't
    // invert to white the way a stroke SVG does), so the lift is what allows
    // these tabs to share the home page's card artwork at all.
    <nav className="mobile-tab-bar fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around rounded-t-3xl border-t border-outline-variant/40 bg-surface/92 px-2 shadow-[0_-6px_24px_-12px_rgba(11,36,51,0.18)] backdrop-blur-xl md:hidden">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const disabled = tab.href == null;
        const isActive =
          !disabled && (pathname === tab.href || (tab.href !== '/' && pathname?.startsWith(tab.href!)));

        const glyph = tab.iconSrc ? (
          <Image
            src={tab.iconSrc}
            alt=""
            width={26}
            height={26}
            className={`object-contain transition-all duration-200 ${
              isActive ? 'size-7' : 'size-6 opacity-45'
            }`}
          />
        ) : (
          <Icon
            width={isActive ? 24 : 22}
            height={isActive ? 24 : 22}
            className={isActive ? 'text-primary' : 'text-on-surface-variant'}
          />
        );

        const content = (
          <div
            className={`flex w-[62px] flex-col items-center justify-center gap-1 transition-transform duration-200 ${
              isActive ? '-translate-y-3.5' : ''
            } ${disabled ? 'opacity-45' : ''}`}
          >
            <span
              className={`relative flex items-center justify-center transition-all duration-200 ${
                isActive
                  ? 'size-12 rounded-full bg-surface ring-1 ring-primary/25 shadow-[0_6px_16px_-6px_rgba(11,36,51,0.35)]'
                  : 'size-7'
              }`}
            >
              {glyph}
              {disabled && (
                <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-surface-tertiary text-on-surface-variant ring-1 ring-outline-variant/50">
                  <LockIcon width={9} height={9} strokeWidth={2.25} />
                </span>
              )}
            </span>
            <span
              className={`whitespace-nowrap text-[9px] font-semibold tracking-tight transition-colors ${
                isActive ? 'text-primary' : 'text-on-surface-variant'
              }`}
            >
              {tab.label}
            </span>
          </div>
        );

        return disabled ? (
          <div key={tab.key} aria-disabled="true" className="cursor-not-allowed">
            {content}
          </div>
        ) : (
          <Link key={tab.key} href={tab.href!} aria-current={isActive ? 'page' : undefined}>
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
