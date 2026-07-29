'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType, SVGProps } from 'react';
import { HomeIcon, ChatIcon, RulesIcon, CubeIcon, TrophyIcon, LockIcon } from '@/components/icons';

interface TabItem {
  key: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  href: string | null;
}

// Garage/Exam have no dedicated route today: "garage" only exists as a
// section inside /coin-qazan (lib/garage/garage.ts, components/coins/GarageCard.tsx),
// not its own page, and "exam" has no route anywhere in app/**. Rendered
// disabled (dim, no-op) rather than guessing a URL — flagged back to the
// lead/user per the task brief.
const TABS: TabItem[] = [
  { key: 'home', label: 'Ana səhifə', icon: HomeIcon, href: '/' },
  { key: 'chat', label: 'AI Hüquq', icon: ChatIcon, href: '/chat' },
  { key: 'academy', label: 'Akademiya', icon: RulesIcon, href: '/oyrenme' },
  { key: 'garage', label: 'Qaraj', icon: CubeIcon, href: null },
  { key: 'exam', label: 'İmtahan', icon: TrophyIcon, href: null },
];

// Scoped to the mobile home view only — rendered exclusively by
// components/home/MobileHome.tsx, NOT mounted in app/layout.tsx. Promoting
// this to app-wide chrome is a separate decision (it would affect every
// route) and needs Garage/Exam to have real routes first.
export default function MobileBottomTabBar() {
  const pathname = usePathname();

  return (
    <nav className="mobile-tab-bar fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-outline-variant/30 bg-surface/80 px-0.5 backdrop-blur-xl md:hidden">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const disabled = tab.href == null;
        const isActive = !disabled && pathname === tab.href;
        const content = (
          <div
            className={`relative flex flex-col items-center gap-0.5 rounded-xl px-1.5 py-1.5 transition-colors ${
              isActive
                ? 'bg-primary/15 text-primary'
                : disabled
                  ? 'text-on-surface-variant/40 grayscale-[60%]'
                  : 'text-on-surface-variant'
            }`}
          >
            {disabled && (
              <span className="absolute -top-1 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-surface-tertiary text-on-surface-variant ring-1 ring-outline-variant/40">
                <LockIcon width={9} height={9} strokeWidth={2.25} />
              </span>
            )}
            <Icon width={20} height={20} />
            <span className="text-legal-citation whitespace-nowrap normal-case">{tab.label}</span>
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
