import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@heroui/styles';
import { CategoryCard } from '@/components/CategoryCard';
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
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-primary/10 px-4 py-1.5 text-label-sm text-primary">
            <span className="size-2 rounded-full bg-go-green" />
            Bilik Bazası
          </span>
          <h1 className="text-display-lg text-balance">Qaydalar Kataloqu</h1>
          <p className="max-w-2xl text-body-lg text-on-surface-variant">
            Azərbaycan Yol Hərəkəti Qaydalarının əsas kateqoriyaları üzrə tam bələdçi. Hər kateqoriya
            rəsmi maddələrə istinad edir — ətraflı izah üçün AI köməkçidən soruşa bilərsiniz.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <span className="rounded-full border border-regulatory-blue/30 bg-regulatory-blue/15 px-4 py-1.5 text-legal-citation text-regulatory-blue">
              İXM 2024
            </span>
            <span className="rounded-full border border-go-green/30 bg-go-green/15 px-4 py-1.5 text-legal-citation text-go-green">
              Son Yenilənmə
            </span>
            <span className="rounded-full border border-caution-orange/30 bg-caution-orange/15 px-4 py-1.5 text-legal-citation text-caution-orange">
              Maddə 342
            </span>
          </div>
          <Link
            href="/chat"
            className={
              buttonVariants({ variant: 'primary', size: 'lg' }) +
              ' glow-primary mt-2 transition-transform hover:scale-[1.03] active:scale-[0.98]'
            }
          >
            AI köməkçidən soruş
          </Link>
        </div>
      </section>

      <section className="px-6 py-8 lg:py-12">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {RULE_CATEGORIES.map((category, i) => (
              <CategoryCard
                key={category.title}
                category={category}
                index={i}
                href="/chat"
                animationDelayMs={i * 80}
              />
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
