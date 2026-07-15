import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@heroui/styles';
import { Card } from '@heroui/react';
import Footer from '@/components/Footer';
import { RULE_CATEGORIES } from '@/lib/content/ruleCategories';

export const metadata: Metadata = {
  title: 'Qaydalar',
};

export default function QaydalarPage() {
  return (
    <div id="top" className="flex flex-1 flex-col">
      <section className="relative overflow-hidden px-6 py-16 lg:py-20">
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center gap-4 text-center">
          <span className="mono-label rounded-full bg-primary/15 px-3 py-1 text-primary">
            Bilik Bazası
          </span>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Qaydalar
          </h1>
          <p className="max-w-2xl text-on-surface-variant">
            Azərbaycan Yol Hərəkəti Qaydalarının əsas kateqoriyaları üzrə tam bələdçi. Hər kateqoriya
            rəsmi maddələrə istinad edir — ətraflı izah üçün AI köməkçidən soruşa bilərsiniz.
          </p>
          <Link
            href="/chat"
            className={buttonVariants({ variant: 'primary', size: 'lg' }) + ' glow-primary mt-2'}
          >
            AI köməkçidən soruş
          </Link>
        </div>
      </section>

      <section className="px-6 py-8 lg:py-12">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {RULE_CATEGORIES.map(({ icon: Icon, title, description, citation }) => (
              <Link key={title} href="/chat" className="block">
                <Card className="glass-card h-full border-0 transition-transform hover:-translate-y-1">
                  <Card.Header>
                    <div className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary mb-2">
                      <Icon />
                    </div>
                    <Card.Title className="font-display">{title}</Card.Title>
                    <Card.Description className="text-on-surface-variant">
                      {description}
                    </Card.Description>
                  </Card.Header>
                  <Card.Footer className="mt-2 border-t border-outline-variant/40 pt-3">
                    <span className="mono-label text-tertiary">{citation}</span>
                  </Card.Footer>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
