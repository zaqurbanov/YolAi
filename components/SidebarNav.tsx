'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChatIcon, HomeIcon, RulesIcon, SettingsIcon } from '@/components/icons';

const ICONS = {
  home: HomeIcon,
  chat: ChatIcon,
  rules: RulesIcon,
  settings: SettingsIcon,
};

interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
}

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 px-3">
      {items.map(({ href, label, icon }) => {
        const Icon = ICONS[icon];
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'bg-accent-soft text-accent-soft-foreground'
                : 'text-muted hover:bg-surface-hover hover:text-foreground'
            }`}
          >
            <Icon className="shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
