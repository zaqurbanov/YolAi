import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import { buttonVariants } from '@heroui/styles';
import DailyQuizCard from '@/components/account/DailyQuizCard';
import MobileBottomTabBar from '@/components/home/MobileBottomTabBar';
import { CategoryCard } from '@/components/CategoryCard';
import ScrollReveal from '@/components/ScrollReveal';
import Footer from '@/components/Footer';
import { ArrowRightIcon, CheckIcon, CoinIcon, FlameIcon } from '@/components/icons';
import type { RuleCategory } from '@/lib/content/ruleCategories';
import type { StreakStatus } from '@/lib/coins/quiz';

export interface EtherealQuickLink {
  key: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** null renders a disabled "tezliklə" tile instead of guessing a route. */
  href: string | null;
}

export interface EtherealHomeProps {
  isLoggedIn: boolean;
  firstName: string | null;
  /** Real user_coins balance; null when logged out OR admin (coin-exempt). */
  coinBalance: number | null;
  progress: { totalTopics: number; passedTopics: number; progressPct: number };
  streakStatus: StreakStatus;
  /** null when logged out or admin (coin economy doesn't apply to admins). */
  dailyQuiz: { question: string; options: string[]; alreadyClaimed: boolean; reward: number } | null;
  quickLinks: EtherealQuickLink[];
  /** Full home preview set — the bento grid below renders all of them. */
  topics: RuleCategory[];
  questionCounts: Record<string, number>;
  featureCards: ReadonlyArray<{
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    title: string;
    desc: string;
    href: string;
    cta: string;
  }>;
  coinEarn: readonly string[];
  promoFeatures: readonly string[];
  stats: ReadonlyArray<{ value: string; label: string }>;
  formattedDriverCount: string;
  driverInitials: string[];
}

// Per-tile accent rotation for the quick-access bento. The Stitch "Ethereal"
// screen gives each of the four tiles a different circular icon chip that
// fills solid on hover — these are the four token families that exist in the
// Ethereal ramp (error / secondary / primary / tertiary), in the mockup's own
// order.
const QUICK_LINK_ACCENTS = [
  { chip: 'bg-error-container/40 text-error', fill: 'group-hover:bg-error group-hover:text-white' },
  { chip: 'bg-secondary-container/50 text-secondary', fill: 'group-hover:bg-secondary group-hover:text-white' },
  { chip: 'bg-primary/12 text-primary', fill: 'group-hover:bg-primary group-hover:text-on-primary' },
  { chip: 'bg-tertiary/12 text-tertiary', fill: 'group-hover:bg-tertiary group-hover:text-white' },
];

const PILLAR_ACCENTS = [
  'bg-primary/12 text-primary',
  'bg-secondary-container/50 text-secondary',
  'bg-tertiary/12 text-tertiary',
  'bg-error-container/40 text-error',
];

function SectionHeading({ eyebrow, title, desc }: { eyebrow: string; title: string; desc?: string }) {
  return (
    <div className="mb-6 max-w-2xl">
      <span className="text-legal-citation text-secondary">{eyebrow}</span>
      <h2 className="mt-1.5 text-headline-md text-on-surface">{title}</h2>
      {desc && <p className="mt-2 text-body-md text-on-surface-variant">{desc}</p>}
    </div>
  );
}

/**
 * "Ethereal" home page — ONE responsive tree for both mobile and desktop
 * (the source design is itself responsive: the bento goes 2 -> 4 columns and
 * the daily-question card goes stacked -> 2 columns), replacing the previous
 * split of a `md:hidden` MobileHome plus a separate `md:contents` desktop
 * marketing tree.
 *
 * Source: Stitch project 9832560642768971810, screen "Ana Səhifə (Ethereal)"
 * (f5a4d622742a4b32b5cc86063f524caa). Layout, section order and the signature
 * effects (white glass, tinted luminous shadows, holographic dividers, the
 * violet->teal gradient, blurred colour orbs) follow it. Colours come from the
 * app's own tokens, whose LIGHT theme was rebuilt from that same screen's spec
 * — so this tree is not hardcoded to one palette and still renders correctly
 * when the user switches to the dark theme.
 *
 * Logged-in visitors get the mockup's dashboard framing (greeting, readiness,
 * quick access, daily question). Logged-out visitors get a hero in the same
 * visual language instead — the mockup only depicts the signed-in state, and
 * showing an empty "0% hazırsan" card to a stranger would be worse than the
 * marketing framing it replaces.
 */
export default function EtherealHome({
  isLoggedIn,
  firstName,
  coinBalance,
  progress,
  streakStatus,
  dailyQuiz,
  quickLinks,
  topics,
  questionCounts,
  featureCards,
  coinEarn,
  promoFeatures,
  stats,
  formattedDriverCount,
  driverInitials,
}: EtherealHomeProps) {
  return (
    <div
      id="top"
      className="ethereal-home flex flex-1 flex-col pb-24 md:pb-0"
      style={{ fontFamily: 'var(--font-jakarta), var(--font-inter), sans-serif' }}
    >
      <div className="mx-auto w-full max-w-[1280px] space-y-10 px-5 pt-8 md:px-12 md:pt-12">
        {isLoggedIn ? (
          <>
            <header>
              <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-on-surface md:text-[32px]">
                Xoş gəldin{firstName ? `, ${firstName}` : ''}! 👋
              </h1>
              <p className="mt-2 text-body-md text-on-surface-variant">
                Bu gün yol hərəkəti qaydalarını öyrənmək üçün əla gündür.
              </p>
            </header>

            {/* Readiness card — the mockup's hero element. 85% there is static;
                here it is the real lesson-completion percentage. */}
            <section className="glass-card luminous-shadow-violet relative overflow-hidden rounded-[2rem] p-6 md:p-8">
              <div className="ethereal-orb -right-10 -top-10 size-40 bg-primary/25" aria-hidden />
              <div className="relative z-10 flex flex-col items-start justify-between gap-5 md:flex-row md:items-center">
                <div>
                  <h2 className="text-[20px] font-semibold text-primary">Hazırlıq Səviyyəsi</h2>
                  <p className="mt-1 text-body-md text-on-surface-variant">
                    {progress.totalTopics === 0
                      ? 'Dərslərə başla və irəliləyişini burada izlə.'
                      : progress.progressPct >= 80
                        ? 'İmtahana tam hazırsan!'
                        : `${progress.passedTopics}/${progress.totalTopics} mövzu tamamlanıb.`}
                  </p>
                </div>
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-extrabold text-primary tabular-nums">
                    {progress.progressPct}%
                  </span>
                  <span className="text-legal-citation mb-2 text-on-surface-variant">tərəqqi</span>
                </div>
              </div>
              <div className="mt-6 h-3 w-full overflow-hidden rounded-full bg-surface-secondary">
                <div
                  className="ethereal-gradient h-full rounded-full shadow-[0_0_15px_rgba(107,56,212,0.4)] transition-all duration-700"
                  style={{ width: `${Math.max(progress.progressPct, 2)}%` }}
                />
              </div>

              {/* Not in the mockup, but the streak and coin balance have no
                  other home on this page now that the old mobile dashboard
                  tiles are gone — folded into the same card rather than added
                  as two more boxes. */}
              {(streakStatus.current > 0 || coinBalance != null) && (
                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-outline-variant/40 pt-4">
                  {streakStatus.current > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-tertiary/10 px-3 py-1.5 text-label-sm font-semibold text-tertiary">
                      <FlameIcon
                        width={14}
                        height={14}
                        className="streak-flame motion-reduce:animate-none"
                      />
                      {streakStatus.current} gün ardıcıl
                    </span>
                  )}
                  {coinBalance != null && (
                    <Link
                      href="/coin-qazan"
                      className="inline-flex items-center gap-1.5 rounded-full bg-secondary-container/50 px-3 py-1.5 text-label-sm font-semibold text-on-secondary-container transition hover:bg-secondary-container/80"
                    >
                      <CoinIcon width={14} height={14} />
                      {coinBalance} coin
                    </Link>
                  )}
                </div>
              )}
            </section>
          </>
        ) : (
          /* Logged-out hero, same visual language as the readiness card. */
          <section className="glass-card luminous-shadow-violet relative overflow-hidden rounded-[2rem] px-6 py-12 text-center md:px-12 md:py-16">
            <div className="ethereal-orb -right-16 -top-16 size-64 bg-primary/25" aria-hidden />
            <div className="ethereal-orb -bottom-20 -left-16 size-64 bg-secondary/20" aria-hidden />
            <div className="relative z-10 mx-auto max-w-2xl">
              <span className="text-legal-citation inline-flex items-center gap-2 rounded-full bg-secondary-container/50 px-4 py-1.5 text-on-secondary-container">
                Rəsmi sənədlərə əsaslanan hüquqi AI
              </span>
              <h1 className="mt-5 text-[32px] font-extrabold leading-[1.1] tracking-tight text-on-surface md:text-[56px]">
                Yol Hərəkəti Qaydaları üzrə{' '}
                <span className="ethereal-gradient-text">AI köməkçi</span>
              </h1>
              <p className="mx-auto mt-4 max-w-md text-body-md text-on-surface-variant">
                Sualını yaz, rəsmi sənədlərə istinad edən cavab al. Üstəlik: vəsiqə dərslərini keç,
                testləri həll et və oyunlarla coin qazan.
              </p>
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/chat"
                  className={`${buttonVariants({ variant: 'primary', size: 'lg' })} ethereal-gradient glow-primary rounded-full border-0 text-white`}
                >
                  Suala başla
                </Link>
                <Link
                  href="/oyrenme"
                  className={`${buttonVariants({ variant: 'outline', size: 'lg' })} rounded-full border-primary/30 text-primary hover:bg-primary/5`}
                >
                  Dərslərə başla
                </Link>
              </div>
              {driverInitials.length > 0 && (
                <div className="mt-8 flex items-center justify-center gap-3">
                  <div className="flex -space-x-3">
                    {driverInitials.map((initial, i) => (
                      <span
                        key={i}
                        className="flex size-9 items-center justify-center rounded-full border-2 border-surface bg-primary/15 text-label-sm font-bold text-primary"
                      >
                        {initial}
                      </span>
                    ))}
                  </div>
                  <p className="text-label-sm text-on-surface-variant">
                    <span className="font-bold text-on-surface">{formattedDriverCount}</span> sürücü
                    artıq istifadə edir
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Quick-access bento — 2 columns on mobile, 4 on desktop, exactly as
            the source screen. */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {quickLinks.map((item, i) => {
            const Icon = item.icon;
            const disabled = item.href == null;
            const accent = QUICK_LINK_ACCENTS[i % QUICK_LINK_ACCENTS.length];
            const content = (
              <div
                className={`glass-card group relative flex h-full flex-col items-center justify-center gap-3 rounded-[2rem] p-6 transition-all ${
                  disabled ? 'opacity-50' : 'hover:scale-[1.02] active:scale-95'
                }`}
              >
                {disabled && (
                  <span className="text-legal-citation absolute right-3 top-3 rounded-full bg-surface-secondary px-2 py-0.5 text-[9px] text-on-surface-variant">
                    Tezliklə
                  </span>
                )}
                <div
                  className={`flex size-12 items-center justify-center rounded-full transition-colors ${
                    disabled ? 'bg-surface-secondary text-on-surface-variant' : `${accent.chip} ${accent.fill}`
                  }`}
                >
                  <Icon />
                </div>
                <span className="text-center text-body-md font-semibold text-on-surface">
                  {item.label}
                </span>
              </div>
            );
            return disabled ? (
              <div key={item.key} aria-disabled="true" className="cursor-not-allowed">
                {content}
              </div>
            ) : (
              <Link key={item.key} href={item.href!} className="block h-full">
                {content}
              </Link>
            );
          })}
        </section>

        <div className="holographic-divider" />

        {/* "Günün Sualı". The real DailyQuizCard is mounted unchanged — it owns
            the claimDailyQuizReward server action, the streak indicator and the
            already-claimed state, none of which may be re-drawn here. Ethereal
            chrome is applied around it; the card itself is repainted by the
            scoped .ethereal-home rules in globals.css. */}
        {dailyQuiz && (
          <section className="ethereal-quiz relative">
            <span className="text-legal-citation absolute -top-3 left-6 z-10 rounded-full bg-secondary-container px-3 py-1 text-on-secondary-container">
              Günün Sualı
            </span>
            <DailyQuizCard
              question={dailyQuiz.question}
              options={dailyQuiz.options}
              alreadyClaimed={dailyQuiz.alreadyClaimed}
              reward={dailyQuiz.reward}
              streakStatus={streakStatus}
            />
          </section>
        )}

        <div className="holographic-divider" />

        {/* Four pillars. */}
        <section>
          <SectionHeading
            eyebrow="İmkanlar"
            title="YOL ilə nələr edə bilərsiniz?"
            desc="Bu platforma yalnız sual-cavab deyil — qaydaları öyrənmək, imtahana hazırlaşmaq və əylənərək irəliləmək üçün tam bir dəstdir."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {featureCards.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <ScrollReveal key={feature.title} delayMs={i * 80}>
                  <div className="glass-card group flex h-full flex-col gap-3 rounded-[2rem] p-6 transition-all hover:-translate-y-1 hover:luminous-shadow-violet">
                    <div
                      className={`flex size-12 items-center justify-center rounded-full ${PILLAR_ACCENTS[i % PILLAR_ACCENTS.length]}`}
                    >
                      <Icon />
                    </div>
                    <h3 className="text-[20px] font-semibold text-on-surface">{feature.title}</h3>
                    <p className="flex-1 text-body-md text-on-surface-variant">{feature.desc}</p>
                    <Link
                      href={feature.href}
                      className="mt-1 inline-flex w-fit items-center gap-1.5 text-label-sm font-semibold text-primary transition hover:gap-2.5"
                    >
                      {feature.cta}
                      <ArrowRightIcon width={14} height={14} />
                    </Link>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </section>

        {/* Stats band. */}
        <section className="glass-card luminous-shadow-teal relative overflow-hidden rounded-[2rem] p-8">
          <div className="ethereal-orb -left-10 -bottom-10 size-40 bg-secondary/20" aria-hidden />
          <div className="relative z-10 grid gap-6 text-center sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="ethereal-gradient-text text-4xl font-extrabold tabular-nums">
                  {stat.value}
                </p>
                <p className="mt-1 text-label-sm text-on-surface-variant">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="holographic-divider" />

        {/* Knowledge base. CategoryCard is reused unmodified — it carries the
            real citations, question counts and /chat?q= links. */}
        <section id="movzular">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <SectionHeading
              eyebrow="Baza"
              title="Geniş Məlumat Bazası"
              desc="Ən çox soruşulan mövzular — birinə toxun və AI-dan dərhal cavab al."
            />
            <Link
              href="/oyrenme"
              className="mb-6 inline-flex items-center gap-1.5 text-label-sm font-semibold text-primary transition hover:gap-2.5"
            >
              Dərslərə başla
              <ArrowRightIcon width={14} height={14} />
            </Link>
          </div>
          <div className="ethereal-topics grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((topic, i) => (
              <ScrollReveal key={topic.title} delayMs={i * 70}>
                <CategoryCard
                  category={topic}
                  index={i}
                  href={`/chat?q=${encodeURIComponent(topic.question)}`}
                  questionCount={questionCounts[topic.title]}
                />
              </ScrollReveal>
            ))}
          </div>
        </section>

        {/* Coin explainer. */}
        <section className="glass-card luminous-shadow-violet relative overflow-hidden rounded-[2rem] p-6 md:p-10">
          <div className="ethereal-orb -right-16 -top-16 size-56 bg-primary/20" aria-hidden />
          <div className="relative z-10 grid gap-8 md:grid-cols-2">
            <div>
              <span className="text-legal-citation text-secondary">Coin sistemi</span>
              <h2 className="mt-1.5 text-headline-md text-on-surface">Öyrən, oyna, qazan</h2>
              <p className="mt-2 text-body-md text-on-surface-variant">
                Pulsuz gündəlik limitdən sonra AI söhbətini coinlərlə davam etdir. Coin qazanmağın
                yolları sadədir və hamısı bir səhifədə.
              </p>
              <Link
                href="/coin-qazan"
                className={`${buttonVariants({ variant: 'primary', size: 'md' })} ethereal-gradient glow-primary mt-6 gap-2 rounded-full border-0 text-white`}
              >
                <CoinIcon width={16} height={16} />
                Coin qazan
              </Link>
            </div>
            <ul className="space-y-3">
              {coinEarn.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary-container/60 text-on-secondary-container">
                    <CheckIcon width={12} height={12} />
                  </span>
                  <span className="text-body-md text-on-surface-variant">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* AI promo / closing CTA. */}
        <section className="glass-card luminous-shadow-teal relative overflow-hidden rounded-[2rem]">
          <div className="grid md:grid-cols-2">
            <div className="ethereal-gradient relative flex min-h-[220px] items-center justify-center overflow-hidden p-10">
              <div className="ethereal-orb -bottom-12 -right-12 size-48 bg-white/25" aria-hidden />
              <p className="relative z-10 text-center text-[24px] font-extrabold leading-snug text-white">
                Sualını yaz,
                <br />
                cavabı mənbəyi ilə al.
              </p>
            </div>
            <div className="space-y-5 p-8 md:p-10">
              <h2 className="text-headline-md text-on-surface">Niyə YOL?</h2>
              <ul className="space-y-3">
                {promoFeatures.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
                      <CheckIcon width={12} height={12} />
                    </span>
                    <span className="text-body-md text-on-surface-variant">{item}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/chat"
                className={`${buttonVariants({ variant: 'primary', size: 'lg' })} ethereal-gradient glow-primary w-full rounded-full border-0 text-white`}
              >
                AI ilə söhbətə başla
              </Link>
            </div>
          </div>
        </section>
      </div>

      <Footer />

      {/* Hard requirement: the mobile bottom tab bar stays. */}
      <MobileBottomTabBar />
    </div>
  );
}
