'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';
import { GridIcon, BriefcaseIcon, RulesIcon, CarIcon, TrophyIcon, LockIcon } from '@/components/icons';

interface TabItem {
  key: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  href: string | null;
}

const TABS: TabItem[] = [
  { key: 'home', label: 'Ana səhifə', icon: GridIcon, href: '/' },
  { key: 'chat', label: 'AI Chat', icon: BriefcaseIcon, href: '/chat' },
  { key: 'academy', label: 'Akademiya', icon: RulesIcon, href: '/oyrenme' },
  { key: 'garage', label: 'Coin Qazan', icon: CarIcon, href: '/coin-qazan' },
  { key: 'exam', label: 'Real imtahan', icon: TrophyIcon, href: '/imtahan' },
];

export default function MobileBottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="mobile-tab-bar fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-white/10 bg-[#121927]/90 px-2 backdrop-blur-xl md:hidden">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const disabled = tab.href == null;
        const isActive = !disabled && (pathname === tab.href || (tab.href !== '/' && pathname?.startsWith(tab.href!)));
        const content = (
          <div
            className={`relative flex items-center justify-center gap-1.5 transition-all duration-200 ${
              isActive
                ? 'rounded-full bg-[#1b4332] px-3.5 py-1.5 text-[#34d399] ring-1 ring-[#34d399]/30'
                : disabled
                  ? 'flex-col gap-0.5 text-slate-500/50 grayscale-[60%]'
                  : 'flex-col gap-0.5 text-slate-400 hover:text-slate-200'
            }`}
          >
            {disabled && (
              <span className="absolute -top-1 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-slate-800 text-slate-400 ring-1 ring-slate-700">
                <LockIcon width={9} height={9} strokeWidth={2.25} />
              </span>
            )}
            <Icon width={isActive ? 18 : 20} height={isActive ? 18 : 20} />
            <span
              className={`font-semibold tracking-tight whitespace-nowrap ${
                isActive ? 'inline-block text-[10px]' : 'block text-[9px]'
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
          <Link key={tab.key} href={tab.href!}>
            {content}
          </Link>
        );
      })}
    </nav>
  );
}

