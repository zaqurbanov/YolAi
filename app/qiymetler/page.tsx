import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@heroui/styles';
import Footer from '@/components/Footer';
import { SparkleIcon } from '@/components/icons';

export const metadata: Metadata = {
  title: 'Qiymətlər',
};

export default function QiymetlerPage() {
  return (
    <div id="top" className="flex flex-1 flex-col">
      <section className="relative overflow-hidden px-6 py-16 lg:py-20">
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <span className="mono-label rounded-full bg-primary/15 px-3 py-1 text-primary">
            Tezliklə
          </span>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Qiymətlər
          </h1>
          <p className="max-w-xl text-on-surface-variant">
            Qiymətləndirmə planları hazırlanır. Tezliklə burada gündəlik mesaj limitini artırmaq
            üçün fərqli planları görəcəksiniz.
          </p>
        </div>
      </section>

      <section className="px-6 py-8 lg:py-12">
        <div className="mx-auto max-w-3xl">
          <div className="glass-card rounded-2xl p-8 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary">
              <SparkleIcon />
            </div>
            <h2 className="font-display text-lg font-semibold text-on-surface">
              Planlar hələ hazırlanır
            </h2>
            <p className="mt-2 text-sm text-on-surface-variant">
              Qiymətləndirmə strukturu üzərində işləyirik. Hazır olduqda bu səhifədə planları və
              gündəlik limitləri görəcəksiniz.
            </p>
            <Link
              href="/chat"
              className={buttonVariants({ variant: 'primary', size: 'md' }) + ' glow-primary mt-6'}
            >
              AI köməkçiyə qayıt
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
