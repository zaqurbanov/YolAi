import Link from 'next/link';
import Image from 'next/image';
import type { ComponentType, SVGProps } from 'react';
import { buttonVariants } from '@heroui/styles';
import DailyQuizCard from '@/components/account/DailyQuizCard';
import MobileBottomTabBar from '@/components/home/MobileBottomTabBar';
import FeatureRail from '@/components/home/FeatureRail';
import { CategoryCard } from '@/components/CategoryCard';
import ScrollReveal from '@/components/ScrollReveal';
import Footer from '@/components/Footer';
import { ArrowRightIcon, CoinIcon, FlameIcon, ShieldIcon } from '@/components/icons';
import type { RuleCategory } from '@/lib/content/ruleCategories';
import type { StreakStatus } from '@/lib/coins/quiz';

export interface EditorialQuickLink {
  key: string;
  label: string;
  /** Short uppercase caption under the title — the export's second line. */
  caption: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /**
   * Optional raster icon from /public, used INSTEAD of `icon` when set. A PNG
   * can't inherit the tile's text colour the way the stroke-based SVG icons do,
   * so only use this where the artwork is meant to carry its own colours.
   * `icon` stays required as the fallback if the image ever fails to load.
   */
  iconSrc?: string;
  /** null renders a disabled "tezliklə" tile instead of guessing a route. */
  href: string | null;
}

export interface EditorialHomeProps {
  isLoggedIn: boolean;
  firstName: string | null;
  coinBalance: number | null;
  progress: { totalTopics: number; passedTopics: number; progressPct: number };
  streakStatus: StreakStatus;
  dailyQuiz: { question: string; options: string[]; alreadyClaimed: boolean; reward: number } | null;
  quickLinks: EditorialQuickLink[];
  topics: RuleCategory[];
  questionCounts: Record<string, number>;
  featureCards: ReadonlyArray<{
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    /** Raster icon from /public/icons, used instead of `icon` when set. */
    iconSrc?: string;
    title: string;
    desc: string;
    href: string;
    cta: string;
  }>;
  stats: ReadonlyArray<{ value: string; label: string }>;
  formattedDriverCount: string;
  driverInitials: string[];
}

// The four bento tiles each get a DIFFERENT weight, in the export's own order.
// This is the load-bearing idea of the design: four identically-styled cards
// read as a list, four differently-weighted ones read as a composition.
const TILE_TONES = [
  'editorial-tile-sage',
  'editorial-tile-primary',
  'editorial-tile-sand',
  'editorial-tile-plain',
];

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-primary">{children}</span>
  );
}

/**
 * "Editorial" home page — one responsive tree for mobile and desktop.
 *
 * Source: Stitch project 9832560642768971810, screen "Ana Səhifə (Editorial)"
 * (34f863119d1840b6a8ca9ebedb399cbe). Its palette and type scale live in
 * app/globals.css under `.editorial`, scoped to this tree — the rest of
 * the app is untouched while this is piloted.
 *
 * Four deliberate departures from the export, each fixing something it got
 * wrong for this app:
 *  1. Its `custom-sand`/`sage`/`teal`/`navy` sat outside the token ramp; they
 *     are real tokens now (see globals.css).
 *  2. Its 20-second rotating text ring is gone. It carried no information and
 *     was the element most likely to date the page; the warm disc it sat in is
 *     kept, static, because the hero composition needs that anchor.
 *  3. It only depicts the signed-in dashboard. A logged-out hero in the same
 *     language is added, rather than showing a stranger an empty "0% hazırsan".
 *  4. Its bento captions ("Yoxla və Ödə") are invented copy; captions here
 *     describe the real destination each tile actually routes to.
 */
export default function EditorialHome({
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
  stats,
  formattedDriverCount,
  driverInitials,
}: EditorialHomeProps) {
  return (
    <div id="top" className="editorial flex flex-1 flex-col pb-24 md:pb-0">
      {/* Editorial spacing: large gaps between sections (the export uses 120px)
          are as much of the look as the colours are. */}
      <div className="mx-auto w-full max-w-[1280px] space-y-16 px-6 pt-10 md:space-y-28 md:px-16 md:pt-16">
        {isLoggedIn ? (
          <section className="grid grid-cols-1 items-center gap-8 md:grid-cols-12">
            <div className="space-y-6 md:col-span-7">
              {/* No generic fallback noun: page.tsx resolves firstName from
                  full_name, then the email local-part. If both are missing the
                  greeting simply carries no name rather than calling the user
                  "sürücü". */}
              <h1 className="text-[32px] font-semibold leading-[1.15] text-navy md:text-[40px]">
                {firstName ? (
                  <>
                    Xoş gəldin, <span className="text-primary">{firstName}</span>.
                  </>
                ) : (
                  'Xoş gəldin.'
                )}
              </h1>
              <p className="max-w-xl text-[18px] leading-relaxed text-on-surface-variant">
                {progress.totalTopics === 0
                  ? 'Dərslərə başla — irəliləyişin bu səhifədə izlənəcək.'
                  : progress.progressPct >= 80
                    ? 'İmtahana hazırlıq səviyyən yüksəkdir. Son hədəfə çatmaq üçün bir neçə addım qalıb.'
                    : `${progress.totalTopics} mövzudan ${progress.passedTopics}-ni tamamlamısan. Davam et.`}
              </p>

              {/* The single dominant number on the page — 64px against 16px
                  body. That 4:1 ratio is what gives the screen a focal point. */}
              <div className="space-y-4 rounded-3xl border border-border/40 bg-surface p-6 shadow-sm">
                <div className="flex items-end justify-between gap-4">
                  <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-navy">
                    Hazırlıq tərəqqisi
                  </span>
                  <span className="editorial-display text-[56px] font-bold leading-none text-primary tabular-nums md:text-[64px]">
                    {progress.progressPct}%
                  </span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-surface-tertiary">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
                    style={{ width: `${Math.max(progress.progressPct, 2)}%` }}
                  />
                </div>
                {(streakStatus.current > 0 || coinBalance != null) && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {streakStatus.current > 0 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-sand px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-navy">
                        <FlameIcon
                          width={13}
                          height={13}
                          className="streak-flame motion-reduce:animate-none"
                        />
                        {streakStatus.current} gün
                      </span>
                    )}
                    {coinBalance != null && (
                      <Link
                        href="/coin-qazan"
                        className="inline-flex items-center gap-1.5 rounded-full bg-surface-tertiary px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.06em] text-navy transition hover:bg-sage/40"
                      >
                        <CoinIcon width={13} height={13} />
                        {coinBalance} coin
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Static seal, not the export's rotating text ring (see the note
                on this component). Desktop-only — on mobile the hero needs the
                full width for type, not decoration. */}
            <div className="hidden justify-center md:col-span-5 md:flex">
              <div className="editorial-seal flex size-40 items-center justify-center rounded-full shadow-lg">
                <ShieldIcon width={64} height={64} />
              </div>
            </div>
          </section>
        ) : (
          <section className="grid grid-cols-1 items-center gap-8 md:grid-cols-12">
            <div className="space-y-6 md:col-span-7">
              <Eyebrow>Rəsmi sənədlərə əsaslanan hüquqi AI</Eyebrow>
              <h1 className="text-[36px] font-semibold leading-[1.1] text-navy md:text-[56px]">
                Yol hərəkəti qaydaları, <span className="text-primary">mənbəyi ilə birlikdə</span>.
              </h1>
              <p className="max-w-xl text-[18px] leading-relaxed text-on-surface-variant">
                Sualını yaz — cavabı rəsmi sənədlərə istinadla al. Üstəlik vəsiqə dərslərini keç,
                testləri həll et və imtahana hazırlaş.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/chat"
                  className={`${buttonVariants({ variant: 'primary', size: 'lg' })} glow-primary rounded-full`}
                >
                  Suala başla
                </Link>
                <Link
                  href="/oyrenme"
                  className={`${buttonVariants({ variant: 'outline', size: 'lg' })} rounded-full border-navy/25 text-navy hover:bg-navy/5`}
                >
                  Dərslərə başla
                </Link>
              </div>
              {driverInitials.length > 0 && (
                <div className="flex items-center gap-3 pt-2">
                  <div className="flex -space-x-3">
                    {driverInitials.map((initial, i) => (
                      <span
                        key={i}
                        className="flex size-9 items-center justify-center rounded-full border-2 border-background bg-sage/40 text-[13px] font-bold text-navy"
                      >
                        {initial}
                      </span>
                    ))}
                  </div>
                  <p className="text-[14px] text-on-surface-variant">
                    <span className="font-bold text-navy">{formattedDriverCount}</span> sürücü artıq
                    istifadə edir
                  </p>
                </div>
              )}
            </div>
            <div className="hidden justify-center md:col-span-5 md:flex">
              <div className="editorial-seal flex size-40 items-center justify-center rounded-full shadow-lg">
                <ShieldIcon width={64} height={64} />
              </div>
            </div>
          </section>
        )}

        {/* Bento — 2 columns on mobile, 4 on desktop. */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {quickLinks.map((item, i) => {
            const Icon = item.icon;
            const disabled = item.href == null;
            const tone = disabled ? 'editorial-tile-plain' : TILE_TONES[i % TILE_TONES.length];
            const isPrimaryTile = tone === 'editorial-tile-primary';
            // Height is content-driven with a floor, NOT aspect-square. A 1:1
            // tile on a 2-column phone grid is ~170px tall holding a small icon
            // and two short lines, which left a large dead gap in the middle —
            // the tile read as mostly empty. gap-4 sets the icon/text distance
            // deliberately instead of justify-between pushing them to opposite
            // ends of whatever height happens to exist.
            const content = (
              <div
                className={`group flex min-h-[128px] flex-col justify-end gap-4 rounded-3xl p-5 transition md:min-h-[168px] md:p-7 ${tone} ${
                  disabled ? 'opacity-55' : 'hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]'
                }`}
              >
                {item.iconSrc ? (
                  <Image
                    src={item.iconSrc}
                    alt=""
                    width={38}
                    height={38}
                    className="size-[38px] object-contain"
                  />
                ) : (
                  <Icon width={38} height={38} className={isPrimaryTile ? '' : 'text-teal-deep'} />
                )}
                <div>
                  <h3 className="text-[18px] font-medium leading-tight md:text-[24px]">
                    {item.label}
                  </h3>
                  <p
                    className={`mt-1 text-[11px] font-bold uppercase tracking-[0.1em] ${
                      isPrimaryTile ? 'opacity-70' : 'text-teal-deep'
                    }`}
                  >
                    {disabled ? 'Tezliklə' : item.caption}
                  </p>
                </div>
              </div>
            );
            return disabled ? (
              <div key={item.key} aria-disabled="true" className="cursor-not-allowed">
                {content}
              </div>
            ) : (
              <Link key={item.key} href={item.href!} className="block">
                {content}
              </Link>
            );
          })}
        </section>

        {/* Günün Sualı — ONE card.
            It used to be a split panel: an outer white card holding a coloured
            left panel and a right panel, with DailyQuizCard's own tinted
            sub-boxes inside that. Four nested backgrounds in four different
            colours, and the innermost lost its padding when the card chrome was
            stripped. The heading now sits outside as a normal section header,
            like every other section, and there is exactly one surface below it.

            DailyQuizCard is still mounted unmodified — it owns the claim server
            action and the streak state and must not be re-drawn here; the
            `editorial-quiz` scope only neutralises its own card chrome so it
            doesn't draw a second box inside this one. */}
        {dailyQuiz && (
          <section>
            <Eyebrow>Günün Sualı</Eyebrow>
            <h2 className="mt-2 text-[28px] font-semibold leading-tight text-navy md:text-[40px]">
              Bir sual, bir dəqiqə, bir enerji.
            </h2>
            <div className="editorial-quiz mt-6 rounded-[32px] border border-border/40 bg-surface p-6 shadow-sm md:p-8">
              <DailyQuizCard
                question={dailyQuiz.question}
                options={dailyQuiz.options}
                alreadyClaimed={dailyQuiz.alreadyClaimed}
                reward={dailyQuiz.reward}
                streakStatus={streakStatus}
              />
            </div>
          </section>
        )}

        {/* Four pillars. */}
        <section>
          <Eyebrow>İmkanlar</Eyebrow>
          <h2 className="mt-2 max-w-2xl text-[28px] font-semibold leading-tight text-navy md:text-[40px]">
            YOL ilə nələr edə bilərsən?
          </h2>
          {/* Rail on mobile, grid on desktop — see FeatureRail. ScrollReveal is
              deliberately NOT used here anymore: a reveal-on-enter transition
              fights a horizontally-scrolled rail (cards off to the right have
              never intersected, so they would sit invisible until scrolled to,
              which defeats the peek that tells you they exist). */}
          <div className="mt-8">
            <FeatureRail>
              {featureCards.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="flex h-full flex-col gap-3 rounded-3xl border border-border/40 bg-surface p-6 transition hover:shadow-md"
                  >
                    {feature.iconSrc ? (
                      <Image
                        src={feature.iconSrc}
                        alt=""
                        width={34}
                        height={34}
                        className="size-[34px] object-contain"
                      />
                    ) : (
                      <Icon width={34} height={34} className="text-teal-deep" />
                    )}
                    <h3 className="text-[20px] font-medium text-navy">{feature.title}</h3>
                    <p className="flex-1 text-[15px] leading-relaxed text-on-surface-variant">
                      {feature.desc}
                    </p>
                    <Link
                      href={feature.href}
                      className="mt-1 inline-flex w-fit items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-primary transition hover:gap-2.5"
                    >
                      {feature.cta}
                      <ArrowRightIcon width={13} height={13} />
                    </Link>
                  </div>
                );
              })}
            </FeatureRail>
          </div>
        </section>

        {/* Stats — full-bleed navy band. A dark strip between two light sections
            is the editorial rhythm device the export uses for its featured
            block; here it carries the numbers. */}
        <section className="editorial-stats-band rounded-[40px] px-8 py-12 md:px-16 md:py-16">
          <div className="grid gap-10 text-center sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="editorial-display text-[48px] font-bold leading-none text-sand tabular-nums md:text-[56px]">
                  {stat.value}
                </p>
                <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.1em] opacity-60">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Knowledge base. CategoryCard reused unmodified — real citations,
            question counts and /chat?q= links. */}
        {/* Desktop only. On mobile this section made the page noticeably too
            long, and it is the most redundant one there: every topic it lists
            is one tap away via the bento's "AI-dan soruş" tiles and the
            Akademiya tab in the bottom bar. Kept on desktop, where vertical
            length is cheap and the 3-column bento actually reads as a grid.
            Nothing links to #movzular, so hiding it breaks no anchor. */}
        <section id="movzular" className="hidden md:block">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Baza</Eyebrow>
              <h2 className="mt-2 text-[28px] font-semibold leading-tight text-navy md:text-[40px]">
                Geniş məlumat bazası
              </h2>
            </div>
            <Link
              href="/oyrenme"
              className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-primary transition hover:gap-2.5"
            >
              Dərslərə başla
              <ArrowRightIcon width={13} height={13} />
            </Link>
          </div>
          <div className="editorial-topics mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((topic, i) => (
              <ScrollReveal key={topic.title} delayMs={i * 60}>
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

      </div>

      <div className="mt-16">
        <Footer />
      </div>

      <MobileBottomTabBar />
    </div>
  );
}
