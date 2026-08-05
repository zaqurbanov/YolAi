import Link from 'next/link';
import Image from 'next/image';
import type { ComponentType, SVGProps } from 'react';
import DailyQuizCard from '@/components/account/DailyQuizCard';
import Footer from '@/components/Footer';
import { CoinIcon, FlameIcon } from '@/components/icons';
import type { StreakStatus } from '@/lib/coins/quiz';

export interface EditorialQuickLink {
  key: string;
  label: string;
  /** Short uppercase caption under the title — the export's second line. */
  caption: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /**
   * The tile's illustration, from /public/icons. REQUIRED on this tree.
   *
   * The editorial trees speak in 3D colour illustrations; the 3D/HUD tree
   * (components/design3d/HomePage3D.tsx) speaks in monochrome stroke icons and
   * uses the sibling `icon` field for that. Both are coherent on their own —
   * what is not coherent is one surface showing some tiles as colour
   * illustrations and others as thin line glyphs, which is what an optional
   * field silently allows the first time someone adds a tile without artwork.
   * Requiring it makes TypeScript, not a reviewer's eye, catch that.
   */
  iconSrc: string;
  /** null renders a disabled "tezliklə" tile instead of guessing a route. */
  href: string | null;
}

export interface EditorialDashboardProps {
  firstName: string | null;
  coinBalance: number | null;
  progress: { totalTopics: number; passedTopics: number; progressPct: number };
  streakStatus: StreakStatus;
  dailyQuiz: { question: string; options: string[]; alreadyClaimed: boolean; reward: number } | null;
  quickLinks: EditorialQuickLink[];
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
 * PERSONAL DASHBOARD — what a signed-in user sees at /home.
 *
 * Split out of the former EditorialHome, which rendered this and the marketing
 * page from one component branching on `isLoggedIn`. Everything here is
 * per-user and session-bound (progress, streak, coin balance, today's quiz), so
 * it is exactly the content that forced `/` to be dynamic; keeping it on its
 * own auth-gated route is what lets the landing go back to being public.
 *
 * There is no logged-out branch on purpose: /home is behind proxy.ts, so an
 * anonymous visitor never reaches this component.
 */
export default function EditorialDashboard({
  firstName,
  coinBalance,
  progress,
  streakStatus,
  dailyQuiz,
  quickLinks,
}: EditorialDashboardProps) {
  return (
    <div id="top" className="editorial flex flex-1 flex-col pb-24 md:pb-0">
      {/* Editorial spacing: large gaps between sections (the export uses 120px)
          are as much of the look as the colours are. */}
      <div className="mx-auto w-full max-w-[1280px] space-y-16 px-6 pt-10 md:space-y-28 md:px-16 md:pt-16">
        <section className="grid grid-cols-1 items-center gap-8 md:grid-cols-12">
          <div className="space-y-6 md:col-span-7">
            {/* No generic fallback noun: the page resolves firstName from
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
                  İrəliləyiş
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

          {/* The seal that used to sit here was decoration for a marketing
              hero; on a dashboard the progress card is the anchor, so the
              column is left to the type instead of duplicating a second focal
              element beside a 64px number. */}
        </section>

        {/* Bento — 2 columns on mobile, 4 on desktop. */}
        <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {quickLinks.map((item, i) => {
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
                <Image
                  src={item.iconSrc}
                  alt=""
                  width={38}
                  height={38}
                  className="icon-illustration icon-illustration-enter size-[38px] object-contain"
                />
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
            DailyQuizCard is mounted unmodified — it owns the claim server
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
      </div>

      <div className="mt-16">
        <Footer />
      </div>
    </div>
  );
}
