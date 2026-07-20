'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs } from '@heroui/react';

const TABS = [
  { id: 'documents', href: '/admin/documents', label: 'Sənədlər' },
  { id: 'users', href: '/admin/users', label: 'İstifadəçilər' },
  { id: 'kurslar', href: '/admin/kurslar', label: 'Kurslar' },
  { id: 'questions', href: '/admin/questions', label: 'Suallar' },
  { id: 'quiz', href: '/admin/quiz', label: 'Test Sualları' },
  { id: 'stats', href: '/admin/stats', label: 'Statistika' },
  { id: 'logs', href: '/admin/logs', label: 'Loglar' },
  { id: 'busy-phrases', href: '/admin/busy-phrases', label: 'Status cümlələri' },
] as const;

export default function AdminTabs() {
  const pathname = usePathname();
  const selected = TABS.find((t) => pathname.startsWith(t.href))?.id ?? 'documents';

  return (
    <Tabs variant="secondary" selectedKey={selected} aria-label="Admin bölmələri">
      <Tabs.ListContainer>
        <Tabs.List aria-label="Admin bölmələri">
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
