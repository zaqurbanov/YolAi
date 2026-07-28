import Image from 'next/image';
import Link from 'next/link';
import { buttonVariants } from '@heroui/styles';
import { Card } from '@heroui/react';
import { CategoryCard } from '@/components/CategoryCard';
import ScrollReveal from '@/components/ScrollReveal';
import Footer from '@/components/Footer';
import { CheckIcon, FineIcon, SparkleIcon, ChatIcon, RulesIcon, CoinIcon, TrophyIcon } from '@/components/icons';
import { getCategoryContent, getCategoryQuestionCounts } from '@/lib/content/categoryContent';
import { getHomeBackgroundImageUrl } from '@/lib/content/homeBackground';
import { getRegisteredDriverCount, getRecentDriverInitials } from '@/lib/content/getRegisteredDriverCount';
import DesignSwitch from '@/components/design3d/DesignSwitch';
import HomePage3D from '@/components/design3d/HomePage3D';
import { getServerDesign } from '@/lib/design/getServerDesign';

// Statically rendered with hourly ISR rather than per-request: the three
// server reads below (background image, registered-driver count, recent
// initials) all go through the service-role client, which never touches
// cookies, so nothing here forces dynamic rendering. They do read live data,
// hence a revalidate window instead of a build-time snapshot frozen forever —
// a registered-driver count does not need to be real-time.
export const revalidate = 3600;

const AVATAR_TONES = ['bg-primary/40', 'bg-regulatory-blue/40', 'bg-go-green/40'];

// Home page preview: the 6 most commonly-asked categories out of the full 8
// in RULE_CATEGORIES — "Kəsişmələr və Üstünlük Hüququ" and "Dayanma və
// Dayanacaq Qaydaları" are intentionally left off this preview and only
// shown as lessons on the full /oyrenme list.
const HOME_TOPIC_TITLES = [
  'Nişanlar',
  'Qaydalar',
  'Cərimələr və Bal Sistemi',
  'Piyada Hərəkəti',
  'Sürət Həddi',
  'Sənədlər və Sığorta',
];
// Bento asymmetry (matches the Stitch mockup's featured-large/regular card
// rhythm) — the featured card is the first entry that lands in each row of
// the lg:grid-cols-3 layout below, at index 0 and index 3.
const FEATURED_TOPIC_INDEXES = new Set([0, 3]);

const PROMO_FEATURES = [
  'Rəsmi sənədlərə əsaslanan, mənbəyə istinad edən cavablar',
  'Azərbaycan dilində sual-cavab dəstəyi',
  '24/7 əlçatan AI köməkçi',
];

// MOCK: "Düzgün cavab nisbəti" has no real accuracy-tracking metric behind
// it (no user feedback/rating system exists yet) and "24/7" is a descriptive
// fact about support availability, not a measured figure — both stay
// illustrative placeholders. The registered-user count next to them (first
// tile, added in the component body below) is real, from
// getRegisteredDriverCount().
const MOCK_STATS_TAIL = [
  { value: '98%', label: 'Düzgün cavab nisbəti', accent: 'text-go-green' },
  { value: '24/7', label: 'Hüquqi dəstək', accent: 'text-regulatory-blue' },
];

// "What you can do here" — the app's four pillars, linking to each. Accent
// colours cycle through the same traffic-signal palette the category cards use,
// so the landing page reads as one system.
const FEATURES = [
  {
    icon: ChatIcon,
    title: 'AI Söhbət',
    desc: 'Yol qaydaları ilə bağlı istənilən sualı yaz — rəsmi sənədlərə əsaslanan, mənbəyə istinad edən cavab al. Vəziyyətin şəklini də göndərə bilərsən.',
    href: '/chat',
    cta: 'Suala başla',
    chip: 'bg-primary/15 text-primary',
    border: 'border-l-primary',
  },
  {
    icon: RulesIcon,
    title: 'Sürücülük dərsləri',
    desc: 'Kateqoriyalar üzrə dərsləri oxu, hər mövzunun sonundakı testi keç və irəliləyişini izlə — sürücülük vəsiqəsi imtahanına addım-addım hazırlaş.',
    href: '/oyrenme',
    cta: 'Dərslərə başla',
    chip: 'bg-regulatory-blue/15 text-regulatory-blue',
    border: 'border-l-regulatory-blue',
  },
  {
    icon: CoinIcon,
    title: 'Coin qazan',
    desc: 'Gündəlik sual, ardıcıllıq seriyası, dostları dəvət və reklam izləmə ilə coin topla. Coinlərlə pulsuz gündəlik limitdən sonra da AI söhbətini davam etdir.',
    href: '/coin-qazan',
    cta: 'Coin qazan',
    chip: 'bg-safety-yellow/15 text-safety-yellow',
    border: 'border-l-safety-yellow',
  },
  {
    icon: TrophyIcon,
    title: 'Oyunlar və Çarx',
    desc: 'Kompüterə qarşı XO oyna, gündəlik pulsuz çarxı fırlat və həftəlik reytinqdə yerini tut — əylənərək coin qazan.',
    href: '/coin-qazan',
    cta: 'Oynamağa başla',
    chip: 'bg-go-green/15 text-go-green',
    border: 'border-l-go-green',
  },
];

// How coins are earned (shown in the coin-explainer section). These mirror the
// real earning mechanics on /coin-qazan.
const COIN_EARN = [
  'Gündəlik sualı düzgün cavabla',
  'Ardıcıl günlərdə seriyanı qoru (streak bonusu)',
  'XO oyna və gündəlik çarxı fırlat',
  'Dostlarını dəvət et',
  'Reklam izlə',
];

export default async function Home() {
  const [design, backgroundImageUrl, driverCount, driverInitials, categories, questionCounts] =
    await Promise.all([
      getServerDesign(),
      getHomeBackgroundImageUrl().then((url) => url ?? '/bg.png'),
      getRegisteredDriverCount(),
      getRecentDriverInitials(),
      getCategoryContent(),
      getCategoryQuestionCounts(),
    ]);
  // Admin-overridable content, so TOPICS is built per render (ISR-cached)
  // rather than at module scope from the raw defaults.
  const topics = HOME_TOPIC_TITLES.map(
    (title) => categories.find((category) => category.title === title)!
  );
  // Real citation reused (not invented) for the hero's floating "cərimə" alert
  // card — sourced from the same merged entry the bento grid below renders, so
  // the hero doesn't introduce a second, drifting copy of it.
  const fineCategory = categories.find((category) => category.title === 'Cərimələr və Bal Sistemi')!;
  const formattedDriverCount = driverCount.toLocaleString('az-AZ');
  const stats = [
    { value: formattedDriverCount, label: 'Aktiv istifadəçi', accent: 'text-primary' },
    ...MOCK_STATS_TAIL,
  ];

  // Phase 1 of the second "Cyber-Circuit Legal" design (see
  // components/design3d/): a client-side switch chooses between the
  // unmodified JSX below (`simple`, also the default/SSR-matching tree) and
  // the new HomePage3D tree (`threeD`), both built from the exact same data
  // fetched above. Every other page in the app is untouched — this is the
  // only page with a second design in this phase.
  return (
    <DesignSwitch
      design={design}
      simple={
    <div id="top" className="flex flex-1 flex-col">
      <section className="relative flex min-h-[640px] flex-col items-center justify-center gap-8 overflow-hidden px-6 py-20 text-center lg:min-h-[720px]">
        <div className="absolute inset-0 z-0">
          <Image
            src={backgroundImageUrl}
            alt=""
            fill
            priority
            unoptimized={backgroundImageUrl !== '/bg.png'}
            className="object-cover object-right opacity-[var(--hero-image-opacity)]"
          />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--color-background)_0%,var(--color-background)_58%,transparent_92%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,var(--hero-top-overlay)_0%,color-mix(in_oklab,var(--background)_30%,transparent)_50%,var(--background)_100%)]" />
          <div className="hero-glow motion-reduce:animate-none absolute inset-0 bg-[radial-gradient(60%_50%_at_75%_35%,color-mix(in_oklab,var(--color-primary)_16%,transparent)_0%,transparent_70%)]" />
        </div>

        <div className="relative z-10 flex flex-col items-center gap-6 max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-primary/10 px-4 py-1.5 text-label-sm text-primary">
            <span className="size-2 rounded-full bg-go-green" />
            Rəsmi sənədlərə əsaslanan hüquqi AI köməkçi
          </span>
          <h1 className="text-display-lg text-balance">
            Yol Hərəkəti Qaydaları üzrə <span className="text-primary italic">AI köməkçi</span>
          </h1>
          <p className="max-w-md text-body-lg text-on-surface-variant">
            Yol hərəkəti qaydaları ilə bağlı sualını yaz, rəsmi sənədlərə əsaslanan, mənbəyə istinad edən
            cavab al.
          </p>
          <p className="max-w-md text-body-md text-on-surface-variant">
            Üstəlik: sürücülük vəsiqəsi üçün dərsləri keç, testləri həll et, gündəlik oyunlarla coin
            qazan və həftəlik reytinqdə yerini tut — hamısı bir platformada.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/chat"
              className={
                buttonVariants({ variant: 'primary', size: 'lg' }) +
                ' glow-primary transition-transform hover:scale-[1.03] active:scale-[0.98]'
              }
            >
              Suala başla
            </Link>
            <Link
              href="/oyrenme"
              className={
                buttonVariants({ variant: 'outline', size: 'lg' }) +
                // Distinct from the plain ghost/ subtle default so this reads as its own
                // CTA rather than a low-priority secondary link — regulatory-blue matches
                // the "Sürücülük dərsləri" pillar card's accent below, so the color itself
                // signals "this is the lessons path" before the label is even read.
                ' border-regulatory-blue/50 text-regulatory-blue bg-regulatory-blue/10' +
                ' shadow-[0_0_16px_rgba(59,130,246,0.18)] transition-all hover:scale-[1.03]' +
                ' hover:border-regulatory-blue hover:bg-regulatory-blue/15 active:scale-[0.98]'
              }
            >
              Sürücülük vəsiqəsi üçün dərslərə başla
            </Link>
          </div>

          {/* Real registered-user count (getRegisteredDriverCount()) and real
              initials of the most recently registered users
              (getRecentDriverInitials()) — a single uppercase letter isn't
              PII, same posture as the Avatar.Fallback initials used
              elsewhere in the app (e.g. app/account/page.tsx). No avatars
              shown at all if there are no real users yet, rather than
              padding with fake ones. */}
          {driverInitials.length > 0 && (
            <div className="flex items-center gap-3 pt-2">
              <div className="flex -space-x-3">
                {driverInitials.map((initial, i) => (
                  <span
                    key={i}
                    className={`flex size-9 items-center justify-center rounded-full border-2 border-background text-label-sm font-bold text-on-surface ${AVATAR_TONES[i % AVATAR_TONES.length]}`}
                  >
                    {initial}
                  </span>
                ))}
              </div>
              <p className="text-label-sm text-on-surface-variant">
                <span className="font-bold text-on-surface">{formattedDriverCount}</span> sürücü artıq istifadə edir
              </p>
            </div>
          )}
        </div>

        <Card className="hero-progress-card motion-reduce:animate-none glass-panel relative z-10 hidden w-full max-w-sm border-0 lg:absolute lg:right-10 lg:bottom-10 lg:flex lg:w-80">
          <Card.Content className="flex flex-row items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-caution-orange/20 text-caution-orange">
              <FineIcon />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-label-sm font-bold text-on-surface">Cərimə Xəbərdarlığı</span>
              <span className="text-legal-citation text-on-surface-variant">{fineCategory.citation}</span>
            </div>
          </Card.Content>
        </Card>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 max-w-2xl">
            <h2 className="text-headline-md">YOL ilə nələr edə bilərsiniz?</h2>
            <p className="mt-1 text-body-md text-on-surface-variant">
              Bu platforma yalnız sual-cavab deyil — yol qaydalarını öyrənmək, vəsiqə imtahanına
              hazırlaşmaq və əylənərək irəliləmək üçün tam bir dəstdir.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <ScrollReveal key={feature.title} delayMs={i * 80}>
                  <div
                    className={`glass-card group flex h-full flex-col gap-3 rounded-2xl border border-transparent border-l-4 ${feature.border} p-6 transition duration-200 hover:-translate-y-1 hover:shadow-lg`}
                  >
                    <div
                      className={`flex size-12 items-center justify-center rounded-xl transition duration-200 group-hover:scale-110 ${feature.chip}`}
                    >
                      <Icon />
                    </div>
                    <h3 className="text-headline-md text-[20px]">{feature.title}</h3>
                    <p className="flex-1 text-body-md text-on-surface-variant">{feature.desc}</p>
                    <Link
                      href={feature.href}
                      className={buttonVariants({ variant: 'ghost', size: 'sm' }) + ' w-fit'}
                    >
                      {feature.cta}
                    </Link>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-6 pb-16">
        <div className="mx-auto max-w-5xl">
          <div className="glass-card rounded-3xl border-primary/20 bg-primary/5 p-8 md:p-10">
            <div className="grid gap-8 sm:grid-cols-3">
              {stats.map((stat) => (
                <div key={stat.label} className="flex flex-col items-center gap-1 text-center">
                  <span className={`text-3xl font-extrabold ${stat.accent}`}>{stat.value}</span>
                  <span className="text-label-sm text-on-surface-variant">{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="movzular" className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="text-headline-md">Geniş Məlumat Bazası</h2>
              <p className="mt-1 text-body-md text-on-surface-variant">
                Hər kateqoriya üzrə dərslərlə qaydaları öyrənin, sualları cavablayıb irəliləyişinizi
                izləyin.
              </p>
            </div>
            <Link href="/oyrenme" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Dərslərə başla
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((topic, i) => (
              <ScrollReveal
                key={topic.title}
                className={FEATURED_TOPIC_INDEXES.has(i) ? 'sm:col-span-2' : ''}
                delayMs={i * 80}
              >
                <CategoryCard
                  category={topic}
                  index={i}
                  href={`/chat?q=${encodeURIComponent(topic.question)}`}
                  questionCount={questionCounts[topic.title]}
                />
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-16">
        <div className="mx-auto max-w-5xl">
          <div className="glass-card rounded-3xl border-safety-yellow/20 bg-safety-yellow/5 p-8 md:p-10">
            <div className="grid gap-8 md:grid-cols-2">
              <div className="flex flex-col gap-3">
                <span className="inline-flex w-fit items-center gap-2 rounded-full bg-safety-yellow/15 px-3 py-1 text-label-sm text-safety-yellow">
                  <CoinIcon className="size-4" />
                  Coin sistemi
                </span>
                <h2 className="text-headline-md">Öyrən, oyna, coin qazan</h2>
                <p className="text-body-md text-on-surface-variant">
                  Coinlər platformanın daxili mükafat vahididir — real pulla alınmır. AI ilə hər
                  gün müəyyən sayda pulsuz söhbət edə bilərsən; bu limit bitəndə topladığın coinlərlə
                  davam edirsən. Coin qazanmağın bir neçə yolu var:
                </p>
                <Link
                  href="/coin-qazan"
                  className={
                    buttonVariants({ variant: 'primary', size: 'md' }) +
                    ' glow-primary mt-1 w-fit transition-transform hover:scale-[1.03] active:scale-[0.98]'
                  }
                >
                  Coin qazanmağa başla
                </Link>
              </div>
              <ul className="flex flex-col justify-center gap-3">
                {COIN_EARN.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-body-md text-on-surface">
                    <CoinIcon width={18} height={18} className="mt-0.5 shrink-0 text-safety-yellow" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-stretch overflow-hidden rounded-3xl border border-primary/20 bg-primary/5 backdrop-blur-2xl transition hover:border-primary/40 hover:bg-primary/10 md:flex-row flex-col">
            <div className="flex min-h-[220px] w-full items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5 md:w-1/2">
              <SparkleIcon className="sparkle-pulse motion-reduce:animate-none size-16 text-primary" />
            </div>
            <div className="flex w-full flex-col gap-4 p-8 md:w-1/2">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-label-sm text-primary">
                <SparkleIcon className="size-4" />
                AI Köməkçi
              </span>
              <h2 className="text-headline-md">Suallarınızı Süni Zəkaya Verin</h2>
              <p className="text-body-lg text-on-surface-variant">
                &quot;Eyni vaxtda kəsişməyə daxil olan iki avtomobilin üstünlüyü necə müəyyən edilir?&quot; –
                Mürəkkəb yol situasiyalarını bizim AI köməkçimizə soruşun və anında izahlı cavab alın.
              </p>
              <ul className="flex flex-col gap-3">
                {PROMO_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-body-md text-on-surface">
                    <CheckIcon className="mt-0.5 shrink-0 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/chat"
                className={
                  buttonVariants({ variant: 'primary', size: 'lg' }) +
                  ' glow-primary w-fit transition-transform hover:scale-[1.03] active:scale-[0.98]'
                }
              >
                Suala başla
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
      }
      threeD={
        <HomePage3D
          formattedDriverCount={formattedDriverCount}
          driverInitials={driverInitials}
          stats={stats}
          topics={topics}
          questionCounts={questionCounts}
          fineCategory={fineCategory}
        />
      }
    />
  );
}
