import Image from 'next/image';
import Link from 'next/link';
import { buttonVariants } from '@heroui/styles';
import { Card, Label, ProgressBar } from '@heroui/react';
import Footer from '@/components/Footer';
import { CheckIcon, FineIcon, RulesIcon, SignIcon, SparkleIcon } from '@/components/icons';

const TOPICS = [
  {
    icon: SignIcon,
    title: 'Nişanlar',
    description: 'Məlumatlandırıcı, xəbərdarlıq və qadağan nişanlarını nümunələrlə öyrənin.',
    citation: 'Maddə 18 | Yol nişanları',
  },
  {
    icon: RulesIcon,
    title: 'Qaydalar',
    description: 'Yol hərəkəti haqqında qanunvericiliyin əsas maddələri və tətbiqi qaydaları.',
    citation: 'Maddə 47 | Ümumi müddəalar',
  },
  {
    icon: FineIcon,
    title: 'Cərimələr',
    description: 'Qayda pozuntularına görə tətbiq edilən cərimələr və bal sisteminin ətraflı izahı.',
    citation: 'İXM, Maddə 128 | Cərimə sanksiyaları',
  },
];

const PROMO_FEATURES = [
  'Rəsmi sənədlərə əsaslanan, mənbəyə istinad edən cavablar',
  'Azərbaycan dilində sual-cavab dəstəyi',
  '24/7 əlçatan AI köməkçi',
];

export default function Home() {
  return (
    <div id="top" className="flex flex-1 flex-col">
      <section className="relative flex min-h-[640px] flex-col items-center justify-center gap-8 overflow-hidden px-6 py-20 text-center lg:min-h-[720px]">
        <div className="absolute inset-0 z-0">
          <Image
            src="/bg.png"
            alt=""
            fill
            priority
            className="object-cover object-right opacity-[var(--hero-image-opacity)]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-background)_0%,var(--color-background)_58%,transparent_92%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,var(--hero-top-overlay)_0%,color-mix(in_oklab,var(--background)_30%,transparent)_50%,var(--background)_100%)]" />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-6 max-w-xl">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Yol Hərəkəti Qaydaları üzrə AI köməkçi
          </h1>
          <p className="max-w-md text-on-surface-variant">
            Yol hərəkəti qaydaları ilə bağlı sualını yaz, rəsmi sənədlərə əsaslanan, mənbəyə istinad edən
            cavab al.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/chat"
              className={buttonVariants({ variant: 'primary', size: 'lg' }) + ' glow-primary'}
            >
              Suala başla
            </Link>
            <Link href="#movzular" className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
              Mövzulara bax
            </Link>
          </div>
        </div>

        <Card className="glass-panel relative z-10 hidden w-full max-w-sm border-0 lg:absolute lg:right-10 lg:bottom-10 lg:flex lg:w-80">
          <Card.Content className="flex flex-col gap-4">
            <ProgressBar aria-label="Nişanlar mövzusu üzrə tərəqqi" value={85}>
              <Label>Nişanlar</Label>
              <ProgressBar.Output />
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
            <ProgressBar aria-label="Qaydalar mövzusu üzrə tərəqqi" value={65}>
              <Label>Qaydalar</Label>
              <ProgressBar.Output />
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
          </Card.Content>
        </Card>
      </section>

      <section id="movzular" className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="font-display text-xl font-semibold sm:text-2xl">Əsas Kateqoriyalar</h2>
              <p className="text-on-surface-variant mt-1">Ən çox soruşulan mövzular üzrə qısa önizləmə — tam siyahı Qaydalar səhifəsindədir.</p>
            </div>
            <Link href="/qaydalar" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Hamısına bax
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-3">
            {TOPICS.map(({ icon: Icon, title, description, citation }) => (
              <Card key={title} className="glass-card border-0">
                <Card.Header>
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary/15 text-primary mb-2">
                    <Icon />
                  </div>
                  <Card.Title className="font-display">{title}</Card.Title>
                  <Card.Description className="text-on-surface-variant">{description}</Card.Description>
                </Card.Header>
                <Card.Footer className="mt-2 border-t border-outline-variant/40 pt-3">
                  <span className="mono-label text-tertiary">{citation}</span>
                </Card.Footer>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-stretch overflow-hidden rounded-3xl border border-primary/20 bg-primary/5 backdrop-blur-2xl md:flex-row flex-col">
            <div className="flex min-h-[220px] w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5 md:w-1/2">
              <SparkleIcon className="size-16 text-primary" />
            </div>
            <div className="flex w-full flex-col gap-4 p-8 md:w-1/2">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-sm font-medium text-primary">
                <SparkleIcon className="size-4" />
                AI Köməkçi
              </span>
              <h2 className="font-display text-xl font-semibold sm:text-2xl">Suallarınızı Süni Zəkaya Verin</h2>
              <p className="text-on-surface-variant">
                &quot;Eyni vaxtda kəsişməyə daxil olan iki avtomobilin üstünlüyü necə müəyyən edilir?&quot; –
                Mürəkkəb yol situasiyalarını bizim AI köməkçimizə soruşun və anında izahlı cavab alın.
              </p>
              <ul className="flex flex-col gap-3">
                {PROMO_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-on-surface">
                    <CheckIcon className="mt-0.5 shrink-0 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/chat"
                className={buttonVariants({ variant: 'primary', size: 'lg' }) + ' glow-primary w-fit'}
              >
                Suala başla
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
