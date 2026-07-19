'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs } from '@heroui/react';

const TABS = [
  { id: 'faq', href: '/faq/faq', label: 'Suallar' },
  { id: 'istifade-qaydalari', href: '/faq/istifade-qaydalari', label: 'İstifadə Qaydaları' },
  { id: 'privacy', href: '/faq/privacy', label: 'Məxfilik Siyasəti' },
  { id: 'terms', href: '/faq/terms', label: 'İstifadə Şərtləri' },
] as const;

export default function FaqTabs() {
  const pathname = usePathname();
  const selected = TABS.find((t) => pathname.startsWith(t.href))?.id ?? 'faq';

  return (
    <Tabs variant="secondary" selectedKey={selected} aria-label="FAQ bölmələri">
      <Tabs.ListContainer>
        <Tabs.List aria-label="FAQ bölmələri">
          {TABS.map((tab) => (
            <Tabs.Tab
              key={tab.id}
              id={tab.id}
              href={tab.href}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches HeroUI's documented Link-tab pattern
              render={(domProps: any) => <Link {...domProps} href={tab.href} />}
            >
              {tab.label}
              <Tabs.Indicator />
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  );
}
