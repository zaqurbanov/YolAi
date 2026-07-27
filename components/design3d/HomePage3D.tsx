import Link from 'next/link';
import type { RuleCategory } from '@/lib/content/ruleCategories';
import RoadShaderBackground from '@/components/design3d/RoadShaderBackground';
import {
  ChatIcon,
  CheckIcon,
  CoinIcon,
  FineIcon,
  HelpIcon,
  RulesIcon,
  SparkleIcon,
  TrophyIcon,
} from '@/components/icons';

interface HomePage3DProps {
  formattedDriverCount: string;
  driverInitials: string[];
  stats: { value: string; label: string; accent: string }[];
  topics: RuleCategory[];
  questionCounts: Record<string, number>;
  fineCategory: RuleCategory;
}

// Same real content as the "sadə dizayn" home page (app/page.tsx) — driver
// count, category titles/descriptions/citations, question counts all come in
// as props from that server component. Only the visual language differs:
// glass + neon "Cyber-Circuit Legal" HUD (see design-system.md /
// ana-sehife-premium/{screenshot.png,code.html} in the design material this
// was built from). Scoped entirely to its own `--hud-*` CSS variables (see
// `[data-design="3d"]` block in app/globals.css) and `hud-*` utility classes
// defined alongside them — nothing here reads or writes the existing
// `--color-*` tokens the rest of the app (including "sadə dizayn") depends
// on, so this tree cannot visually regress any other page.
const FEATURES = [
  {
    icon: ChatIcon,
    title: 'AI Söhbət',
    desc: 'Yol qaydaları ilə bağlı istənilən sualı yaz — rəsmi sənədlərə əsaslanan, mənbəyə istinad edən cavab al. Vəziyyətin şəklini də göndərə bilərsən.',
    href: '/chat',
    cta: 'Suala başla',
    tone: 'primary' as const,
  },
  {
    icon: RulesIcon,
    title: 'Sürücülük dərsləri',
    desc: 'Kateqoriyalar üzrə dərsləri oxu, hər mövzunun sonundakı testi keç və irəliləyişini izlə — sürücülük vəsiqəsi imtahanına addım-addım hazırlaş.',
    href: '/oyrenme',
    cta: 'Dərslərə başla',
    tone: 'cyan' as const,
  },
  {
    icon: CoinIcon,
    title: 'Coin qazan',
    desc: 'Gündəlik sual, ardıcıllıq seriyası, dostları dəvət və reklam izləmə ilə coin topla. Coinlərlə pulsuz gündəlik limitdən sonra da AI söhbətini davam etdir.',
    href: '/coin-qazan',
    cta: 'Coin qazan',
    tone: 'primary' as const,
  },
  {
    icon: TrophyIcon,
    title: 'Oyunlar və Çarx',
    desc: 'Kompüterə qarşı XO oyna, gündəlik pulsuz çarxı fırlat və həftəlik reytinqdə yerini tut — əylənərək coin qazan.',
    href: '/coin-qazan',
    cta: 'Oynamağa başla',
    tone: 'green' as const,
  },
];

const COIN_EARN = [
  'Gündəlik sualı düzgün cavabla',
  'Ardıcıl günlərdə seriyanı qoru (streak bonusu)',
  'XO oyna və gündəlik çarxı fırlat',
  'Dostlarını dəvət et',
  'Reklam izlə',
];

const PROMO_FEATURES = [
  'Rəsmi sənədlərə əsaslanan, mənbəyə istinad edən cavablar',
  'Azərbaycan dilində sual-cavab dəstəyi',
  '24/7 əlçatan AI köməkçi',
];

const FOOTER_LINKS = [
  { href: '/faq/faq', label: 'Suallar' },
  { href: '/faq/privacy', label: 'Məxfilik Siyasəti' },
  { href: '/faq/terms', label: 'İstifadə Şərtləri' },
  { href: '/faq/istifade-qaydalari', label: 'İstifadə Qaydaları' },
];

const TONE_CLASSES = {
  primary: { chip: 'bg-[var(--hud-primary)]/15 text-[var(--hud-primary)]', border: 'border-l-[var(--hud-primary)]' },
  cyan: { chip: 'bg-[var(--hud-cyan)]/15 text-[var(--hud-cyan)]', border: 'border-l-[var(--hud-cyan)]' },
  green: { chip: 'bg-[var(--hud-green)]/15 text-[var(--hud-green)]', border: 'border-l-[var(--hud-green)]' },
};

export default function HomePage3D({
  formattedDriverCount,
  driverInitials,
  stats,
  topics,
  questionCounts,
  fineCategory,
}: HomePage3DProps) {
  return (
    <div
      className="relative flex flex-1 flex-col"
      style={{
        color: 'var(--hud-on-surface)',
        fontFamily: 'var(--hud-font-body)',
      }}
    >
      {/* Whole-page fixed shader backdrop — NOT scoped to the hero anymore.
          `position: fixed` (not absolute) means the canvas always covers
          exactly the viewport regardless of how tall the page's scrollable
          content is: the shader's own "perspective" math (uv.y=0 near/
          uv.y=1 far) is authored against a single screen-height plane, so
          stretching the canvas to the full multi-thousand-px page height
          would break that illusion. Content scrolls freely on top of it —
          every section below is transparent (or `.hud-glass`, already
          semi-transparent) rather than an opaque `--hud-bg` panel, so the
          shader now reads through the ENTIRE page, not just the hero. */}
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--hud-bg-deep)' }} aria-hidden="true">
        <RoadShaderBackground className="absolute inset-0 h-full w-full" />
      </div>
      {/* Sitewide legibility veil, also fixed (sits between the shader and
          all scrolling content at every scroll position) — deliberately
          NOT opaque (~45% mix) so the shader's lane lines/car-light glow
          stay visible everywhere, not just near the hero. Sections/cards
          layer their own `.hud-glass` on top of this for extra contrast
          where there's dense text. */}
      <div
        className="fixed inset-0 -z-10"
        style={{ background: 'color-mix(in oklab, var(--hud-bg-deep) 45%, transparent)' }}
        aria-hidden="true"
      />

      {/* ---------- Hero ---------- */}
      <section className="relative flex min-h-[640px] flex-col items-center justify-center gap-8 overflow-hidden px-6 py-20 text-center lg:min-h-[720px]">
        {/* Extra legibility gradient for the hero's own text cluster, on top
            of the sitewide veil above — heavier at the very top/bottom
            edges, transparent through the middle, still never fully opaque
            so the animation stays visible even here. */}
        <div
          className="absolute inset-0 z-0"
          style={{
            background:
              'linear-gradient(to bottom, color-mix(in oklab, var(--hud-bg-deep) 25%, transparent) 0%, transparent 35%, transparent 65%, color-mix(in oklab, var(--hud-bg-deep) 25%, transparent) 100%)',
          }}
        />

        <div className="relative z-10 flex flex-col items-center gap-6 max-w-xl">
          <span
            className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-widest"
            style={{
              borderColor: 'color-mix(in oklab, var(--hud-primary) 30%, transparent)',
              background: 'color-mix(in oklab, var(--hud-primary) 10%, transparent)',
              color: 'var(--hud-primary)',
            }}
          >
            <span className="size-2 animate-pulse rounded-full" style={{ background: 'var(--hud-green)' }} />
            Rəsmi sənədlərə əsaslanan hüquqi AI köməkçi
          </span>
          <h1
            className="text-4xl font-extrabold leading-tight lg:text-5xl"
            style={{ fontFamily: 'var(--hud-font-display)' }}
          >
            Yol Hərəkəti Qaydaları üzrə{' '}
            <span className="italic" style={{ color: 'var(--hud-primary)', textShadow: '0 0 14px var(--hud-glow-primary)' }}>
              AI köməkçi
            </span>
          </h1>
          <p className="max-w-md text-base" style={{ color: 'var(--hud-on-surface-variant)' }}>
            Yol hərəkəti qaydaları ilə bağlı sualını yaz, rəsmi sənədlərə əsaslanan, mənbəyə istinad edən
            cavab al.
          </p>
          <p className="max-w-md text-sm" style={{ color: 'var(--hud-on-surface-variant)' }}>
            Üstəlik: sürücülük vəsiqəsi üçün dərsləri keç, testləri həll et, gündəlik oyunlarla coin
            qazan və həftəlik reytinqdə yerini tut — hamısı bir platformada.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/chat"
              className="rounded-xl px-8 py-4 text-lg font-bold transition-all hover:scale-105 active:scale-95"
              style={{
                background: 'var(--hud-primary)',
                color: 'var(--hud-on-primary)',
                boxShadow: '0 0 20px var(--hud-glow-primary)',
              }}
            >
              Suala başla
            </Link>
            <Link
              href="/oyrenme"
              className="hud-glass rounded-xl px-8 py-4 text-lg font-bold transition-all hover:bg-white/5"
              style={{ color: 'var(--hud-cyan)' }}
            >
              Sürücülük dərslərinə başla
            </Link>
          </div>

          {driverInitials.length > 0 && (
            <div className="flex items-center gap-3 pt-2">
              <div className="flex -space-x-3">
                {driverInitials.map((initial, i) => (
                  <span
                    key={i}
                    className="flex size-9 items-center justify-center rounded-full border-2 text-[10px] font-bold"
                    style={{
                      borderColor: 'var(--hud-bg-deep)',
                      background: i % 2 === 0 ? 'var(--hud-primary)' : 'var(--hud-cyan)',
                      color: 'var(--hud-on-primary)',
                    }}
                  >
                    {initial}
                  </span>
                ))}
              </div>
              <p className="text-sm" style={{ color: 'var(--hud-on-surface-variant)' }}>
                <span className="font-bold" style={{ color: 'var(--hud-primary)' }}>
                  {formattedDriverCount}
                </span>{' '}
                sürücü artıq istifadə edir
              </p>
            </div>
          )}
        </div>

        {/* Floating HUD alert card, matching the Stitch mockup's floating callout */}
        <div
          className="hud-glass relative z-10 hidden w-80 rounded-xl border-l-4 p-4 lg:absolute lg:right-10 lg:bottom-10 lg:flex lg:items-center lg:gap-3"
          style={{ borderColor: 'var(--hud-red)', boxShadow: '0 0 15px var(--hud-glow-red)' }}
        >
          <div
            className="flex size-11 shrink-0 items-center justify-center rounded-lg"
            style={{ background: 'color-mix(in oklab, var(--hud-red) 20%, transparent)', color: 'var(--hud-red)' }}
          >
            <FineIcon />
          </div>
          <div className="flex flex-col gap-0.5 text-left">
            <span className="text-xs font-bold" style={{ color: 'var(--hud-red)' }}>
              Cərimə Xəbərdarlığı
            </span>
            <span className="text-[13px]" style={{ fontFamily: 'var(--hud-font-mono)', color: 'var(--hud-on-surface-variant)' }}>
              {fineCategory.citation}
            </span>
          </div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 max-w-2xl">
            <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--hud-font-display)' }}>
              YOL ilə nələr edə bilərsiniz?
            </h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--hud-on-surface-variant)' }}>
              Bu platforma yalnız sual-cavab deyil — yol qaydalarını öyrənmək, vəsiqə imtahanına
              hazırlaşmaq və əylənərək irəliləmək üçün tam bir dəstdir.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              const tone = TONE_CLASSES[feature.tone];
              return (
                <div
                  key={feature.title}
                  className={`hud-glass group flex h-full flex-col gap-3 rounded-2xl border-l-4 p-6 transition duration-200 hover:-translate-y-1 ${tone.border}`}
                >
                  <div className={`flex size-12 items-center justify-center rounded-xl transition duration-200 group-hover:scale-110 ${tone.chip}`}>
                    <Icon />
                  </div>
                  <h3 className="text-lg font-bold">{feature.title}</h3>
                  <p className="flex-1 text-sm" style={{ color: 'var(--hud-on-surface-variant)' }}>
                    {feature.desc}
                  </p>
                  <Link href={feature.href} className="w-fit text-sm font-bold" style={{ color: 'var(--hud-primary)' }}>
                    {feature.cta} →
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- Stats ---------- */}
      <section className="px-6 pb-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 sm:grid-cols-3">
            {stats.map((stat, i) => (
              <div key={stat.label} className="hud-glass flex flex-col items-center gap-1 rounded-2xl p-8 text-center">
                <span
                  className="text-4xl font-extrabold"
                  style={{ color: i === 0 ? 'var(--hud-primary)' : i === 1 ? 'var(--hud-cyan)' : 'var(--hud-green)' }}
                >
                  {stat.value}
                </span>
                <span className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--hud-on-surface-variant)' }}>
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Knowledge base / topics ---------- */}
      <section id="movzular" className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--hud-font-display)' }}>
                Geniş Məlumat Bazası
              </h2>
              <p className="mt-1 text-sm" style={{ color: 'var(--hud-on-surface-variant)' }}>
                Hər kateqoriya üzrə dərslərlə qaydaları öyrənin, sualları cavablayıb irəliləyişinizi
                izləyin.
              </p>
            </div>
            <Link href="/oyrenme" className="text-sm font-bold" style={{ color: 'var(--hud-primary)' }}>
              Dərslərə başla →
            </Link>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((topic) => {
              const Icon = topic.icon;
              const count = questionCounts[topic.title];
              return (
                <Link
                  key={topic.title}
                  href={`/chat?q=${encodeURIComponent(topic.question)}`}
                  className="hud-glass group flex flex-col gap-4 rounded-2xl p-6 transition-all hover:bg-white/5"
                >
                  <div className="flex items-start justify-between">
                    <span
                      className="transition-transform duration-200 group-hover:-translate-y-1 group-hover:scale-110"
                      style={{ color: 'var(--hud-primary)' }}
                    >
                      <Icon width={30} height={30} />
                    </span>
                    <span
                      className="rounded px-2 py-1 text-[12px]"
                      style={{
                        fontFamily: 'var(--hud-font-mono)',
                        color: 'var(--hud-primary)',
                        background: 'color-mix(in oklab, var(--hud-primary) 10%, transparent)',
                      }}
                    >
                      {topic.citation.split('|')[0].trim()}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold">{topic.title}</h3>
                  <p className="text-sm" style={{ color: 'var(--hud-on-surface-variant)' }}>
                    {topic.description}
                  </p>
                  {typeof count === 'number' && (
                    <div className="text-[11px] italic" style={{ color: 'var(--hud-outline)' }}>
                      {count} sual
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------- Coin explainer ---------- */}
      <section className="px-6 pb-16">
        <div className="mx-auto max-w-7xl">
          <div
            className="hud-glass rounded-3xl p-8 md:p-10"
            style={{ borderColor: 'color-mix(in oklab, var(--hud-primary) 20%, transparent)' }}
          >
            <div className="grid gap-8 md:grid-cols-2">
              <div className="flex flex-col gap-3">
                <span
                  className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-bold"
                  style={{ background: 'color-mix(in oklab, var(--hud-primary) 15%, transparent)', color: 'var(--hud-primary)' }}
                >
                  <CoinIcon className="size-4" />
                  Coin sistemi
                </span>
                <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--hud-font-display)' }}>
                  Öyrən, oyna, coin qazan
                </h2>
                <p className="text-sm" style={{ color: 'var(--hud-on-surface-variant)' }}>
                  Coinlər platformanın daxili mükafat vahididir — real pulla alınmır. AI ilə hər
                  gün müəyyən sayda pulsuz söhbət edə bilərsən; bu limit bitəndə topladığın coinlərlə
                  davam edirsən. Coin qazanmağın bir neçə yolu var:
                </p>
                <Link
                  href="/coin-qazan"
                  className="mt-1 w-fit rounded-xl px-6 py-3 text-sm font-bold transition-transform hover:scale-105 active:scale-95"
                  style={{ background: 'var(--hud-primary)', color: 'var(--hud-on-primary)', boxShadow: '0 0 20px var(--hud-glow-primary)' }}
                >
                  Coin qazanmağa başla
                </Link>
              </div>
              <ul className="flex flex-col justify-center gap-3">
                {COIN_EARN.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm">
                    <CoinIcon width={18} height={18} className="mt-0.5 shrink-0" style={{ color: 'var(--hud-primary)' }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- AI promo / final CTA ---------- */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <div
            className="flex flex-col overflow-hidden rounded-3xl md:flex-row"
            style={{
              border: '1px solid color-mix(in oklab, var(--hud-cyan) 20%, transparent)',
              background: 'color-mix(in oklab, var(--hud-cyan) 5%, transparent)',
              backdropFilter: 'blur(24px)',
            }}
          >
            <div
              className="flex min-h-[220px] w-full items-center justify-center md:w-1/2"
              style={{
                background:
                  'linear-gradient(135deg, color-mix(in oklab, var(--hud-cyan) 20%, transparent), color-mix(in oklab, var(--hud-cyan) 5%, transparent))',
              }}
            >
              <SparkleIcon className="motion-reduce:animate-none size-16 animate-pulse" style={{ color: 'var(--hud-cyan)' }} />
            </div>
            <div className="flex w-full flex-col gap-4 p-8 md:w-1/2">
              <span
                className="inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-bold"
                style={{ background: 'color-mix(in oklab, var(--hud-cyan) 15%, transparent)', color: 'var(--hud-cyan)' }}
              >
                <SparkleIcon className="size-4" />
                AI Köməkçi
              </span>
              <h2 className="text-2xl font-bold" style={{ fontFamily: 'var(--hud-font-display)' }}>
                Suallarınızı Süni Zəkaya Verin
              </h2>
              <p className="text-base" style={{ color: 'var(--hud-on-surface-variant)' }}>
                &quot;Eyni vaxtda kəsişməyə daxil olan iki avtomobilin üstünlüyü necə müəyyən edilir?&quot; –
                Mürəkkəb yol situasiyalarını bizim AI köməkçimizə soruşun və anında izahlı cavab alın.
              </p>
              <ul className="flex flex-col gap-3">
                {PROMO_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <CheckIcon className="mt-0.5 shrink-0" style={{ color: 'var(--hud-cyan)' }} />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/chat"
                className="w-fit rounded-xl px-8 py-4 text-lg font-bold transition-transform hover:scale-105 active:scale-95"
                style={{ background: 'var(--hud-primary)', color: 'var(--hud-on-primary)', boxShadow: '0 0 20px var(--hud-glow-primary)' }}
              >
                Suala başla
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t px-6 py-8" style={{ borderColor: 'var(--hud-border)' }}>
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex flex-col items-center gap-1 sm:items-start">
            <span className="text-base font-bold" style={{ fontFamily: 'var(--hud-font-display)' }}>
              Yol Hərəkəti QA
            </span>
            <span className="text-xs" style={{ fontFamily: 'var(--hud-font-mono)', color: 'var(--hud-on-surface-variant)' }}>
              &copy; {new Date().getFullYear()} Hüquqi AI köməkçi. Bütün hüquqlar qorunur.
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:flex-nowrap">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="whitespace-nowrap text-sm hover:underline"
                style={{ color: 'var(--hud-on-surface-variant)' }}
              >
                {link.label}
              </Link>
            ))}
            <a
              href="mailto:qurbanovzaur078@gmail.com"
              aria-label="Dəstək"
              className="hud-glass flex size-10 items-center justify-center rounded-full"
              style={{ color: 'var(--hud-on-surface-variant)' }}
            >
              <HelpIcon />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
