import Link from 'next/link';
import { buttonVariants } from '@heroui/styles';
import Footer from '@/components/Footer';
import UnlockCourseCard from '@/app/oyrenme/UnlockCourseCard';
import {
  ArrowRightIcon,
  AwardIcon,
  CheckIcon,
  EnergyIcon,
  LockIcon,
  PlayIcon,
} from '@/components/icons';
import { formatCoinBalance } from '@/lib/format/coins';
import type { CourseSummary, TopicSummary } from '@/lib/quiz/lessons';

export interface EditorialOyrenmeProps {
  courses: CourseSummary[];
  /**
   * ENERGY balance since 0098 (course unlocks spend energy, not coins). null
   * when the read failed — it fails open, so it renders as "—", never as 0.
   */
  balance: number | null;
  overallPct: number;
  totalTopics: number;
  passedTopics: number;
  unlockedCourses: number;
  /** Courses where every published topic has been passed. */
  completedCourses: number;
  featuredCourse: CourseSummary | null;
  featuredTopics: TopicSummary[];
}

/** Rows shown inline before deferring to the course's own topic list. */
const SYLLABUS_LIMIT = 6;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-primary">{children}</span>
  );
}

/**
 * A 0% bar must still read as a bar, not as a broken element — hence the 2%
 * floor on the fill width, the same device EditorialHome uses. The role/value
 * attributes are on the track, so screen readers get the real number, not the
 * clamped one.
 */
function ProgressBar({
  pct,
  label,
  thick = false,
}: {
  pct: number;
  label: string;
  thick?: boolean;
}) {
  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={`w-full overflow-hidden rounded-full bg-surface-tertiary ${thick ? 'h-3' : 'h-1.5'}`}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-out motion-reduce:transition-none"
        style={{ width: `${Math.max(pct, 2)}%` }}
      />
    </div>
  );
}

const PILL = 'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em]';

/**
 * Card body for one course. Rendered inside three different wrappers (a Link,
 * an UnlockCourseCard button, or a plain div) — so NOTHING in here may be
 * focusable: the wrapper is the single interactive element. The "Kursu aç" CTA
 * is therefore an aria-hidden span, the same discipline app/oyrenme/CourseGrid
 * follows.
 */
function CourseCardBody({ course, index }: { course: CourseSummary; index: number }) {
  const isEmpty = course.totalTopics === 0;
  const isLocked = !isEmpty && !course.isUnlocked;
  const isOpen = !isEmpty && course.isUnlocked;
  const isDone = isOpen && course.passedTopics === course.totalTopics;

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="editorial-display text-[13px] font-bold tabular-nums text-teal-deep">
          {String(index + 1).padStart(2, '0')}
        </span>

        {isLocked && (
          <span className={`${PILL} bg-sand/70 text-navy`}>
            <LockIcon width={12} height={12} aria-hidden />
            Kilidli
          </span>
        )}
        {isEmpty && (
          <span className={`${PILL} bg-surface-tertiary text-on-surface-variant`}>Tezliklə</span>
        )}
        {isOpen && (
          <span
            className={`${PILL} tabular-nums ${isDone ? 'bg-sage/40 text-teal-deep' : 'bg-surface-tertiary text-navy'}`}
          >
            {isDone && <CheckIcon width={12} height={12} aria-hidden />}
            {isDone ? 'Bitib' : `${course.progressPct}%`}
          </span>
        )}
      </div>

      <h3
        className={`mt-4 text-[20px] font-medium leading-snug md:text-[22px] ${
          isOpen ? 'text-navy' : 'text-on-surface-variant'
        }`}
      >
        {course.title}
      </h3>

      <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-on-surface-variant">
        {course.description ??
          (isEmpty
            ? 'Bu kurs hazırlanır — mövzular dərc olunan kimi burada görünəcək.'
            : `Bu kursda ${course.totalTopics} mövzu var.`)}
      </p>

      {/* Pushes the footer block to the bottom so cards in a row align. */}
      <div className="flex-1" />

      {isOpen && (
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-teal-deep">
            <span>İrəliləyiş</span>
            <span className="tabular-nums">
              {course.passedTopics}/{course.totalTopics} mövzu
            </span>
          </div>
          <ProgressBar pct={course.progressPct} label={`${course.title} irəliləyişi`} />
        </div>
      )}

      {isLocked && (
        <span
          aria-hidden
          className={`${buttonVariants({ variant: 'primary', size: 'sm' })} mt-6 w-full rounded-full`}
        >
          Kursu aç
        </span>
      )}

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/40 pt-4">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-teal-deep">
          {course.isFree ? 'Pulsuz' : 'Kurs'}
        </span>

        {isLocked && (
          <span className="flex items-center gap-1.5 text-[13px] font-bold tabular-nums text-safety-yellow">
            <EnergyIcon width={15} height={15} aria-hidden />
            {formatCoinBalance(course.price)}
            <span className="sr-only">enerji</span>
          </span>
        )}
        {isOpen && (
          <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.08em] text-primary">
            Mövzulara keç
            <ArrowRightIcon
              width={13}
              height={13}
              aria-hidden
              className="transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none"
            />
          </span>
        )}
        {isEmpty && (
          <span className="text-[12px] text-on-surface-variant">Hazırlanır</span>
        )}
      </div>
    </>
  );
}

const CARD_BASE = 'group flex h-full flex-col rounded-3xl p-6 shadow-sm';
const CARD_SURFACE = 'border border-border/40 bg-surface';

/**
 * "Editorial" Öyrənmə list page — ONE responsive tree for mobile and desktop,
 * matching components/home/EditorialHome: same 1280px column, same section
 * rhythm (Eyebrow + oversized heading), same white-card-on-sand surfaces, same
 * single-dominant-number hero and the same `editorial-stats-band` device.
 *
 * It replaces a split shape (a md:hidden MobileOyrenme + desktop JSX inlined in
 * page.tsx) whose desktop half carried no `editorial` class at all, so desktop
 * /oyrenme rendered in the base palette while / rendered Editorial.
 *
 * Server component on purpose: the only client code on the page is
 * UnlockCourseCard, mounted only for LOCKED cards. The previous mobile tree was
 * wholly 'use client' for one expand/collapse toggle and a snap rail; the grid
 * below shows every course at once instead, which is both better UX and zero JS.
 *
 * app/oyrenme/CourseGrid.tsx is deliberately NOT reused here: the 3D design
 * restyles it through DOM-coupled selectors
 * (`[data-design='3d'] .oyrenme-hud-courses .glass-card`), so it stays untouched
 * and serves the 3D tree alone. UnlockCourseCard IS reused — it owns the energy
 * purchase Modal, the unlockCourseAction call and the `energy-balance-update`
 * event, none of which may be forked.
 */
export default function EditorialOyrenme({
  courses,
  balance,
  overallPct,
  totalTopics,
  passedTopics,
  unlockedCourses,
  completedCourses,
  featuredCourse,
  featuredTopics,
}: EditorialOyrenmeProps) {
  const hasCourses = courses.length > 0;
  const syllabus = featuredTopics.slice(0, SYLLABUS_LIMIT);
  const hiddenTopics = featuredTopics.length - syllabus.length;

  const stats = [
    { value: `${overallPct}%`, label: 'Ümumi tamamlanma' },
    { value: `${passedTopics}/${totalTopics}`, label: 'Keçilmiş mövzu' },
    { value: `${unlockedCourses}/${courses.length}`, label: 'Açıq kurs' },
    { value: String(completedCourses), label: 'Bitirilmiş kurs' },
  ];

  return (
    <div id="top" className="editorial flex flex-1 flex-col pb-24 md:pb-0">
      <div className="mx-auto w-full max-w-[1280px] space-y-16 px-6 pt-10 md:space-y-28 md:px-16 md:pt-16">
        {hasCourses ? (
          <section className="grid grid-cols-1 items-center gap-8 md:grid-cols-12">
            <div className="space-y-6 md:col-span-7">
              <Eyebrow>Öyrənmə mərkəzi</Eyebrow>
              <h1 className="text-[32px] font-semibold leading-[1.15] text-navy md:text-[44px]">
                Sürücülük vəsiqəsini{' '}
                <span className="text-primary">addım-addım</span> al.
              </h1>
              <p className="max-w-xl text-[18px] leading-relaxed text-on-surface-variant">
                {totalTopics === 0
                  ? 'Kurslar dərc olunub, mövzular hazırlanır. Hazır olan kimi burada görünəcək.'
                  : overallPct >= 80
                    ? 'Hazırlıq səviyyən yüksəkdir. Qalan mövzuları bitir və imtahana keç.'
                    : passedTopics === 0
                      ? 'Qaydaları kurslar üzrə öyrən, hər mövzunun sonundakı testi keç — irəliləyişin burada izlənəcək.'
                      : `${totalTopics} mövzudan ${passedTopics}-ni tamamlamısan. Davam et.`}
              </p>

              {/* The single dominant number on the page — the same 4:1 ratio
                  against body type that gives the home hero its focal point. */}
              <div className="space-y-4 rounded-3xl border border-border/40 bg-surface p-6 shadow-sm">
                <div className="flex items-end justify-between gap-4">
                  <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-navy">
                    Ümumi irəliləyiş
                  </span>
                  <span className="editorial-display text-[56px] font-bold leading-none tabular-nums text-primary md:text-[64px]">
                    {overallPct}%
                  </span>
                </div>
                <ProgressBar pct={overallPct} label="Ümumi irəliləyiş" thick />
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {totalTopics > 0 && (
                    <span className={`${PILL} bg-surface-tertiary text-navy tabular-nums`}>
                      {passedTopics}/{totalTopics} mövzu
                    </span>
                  )}
                  <span className={`${PILL} bg-surface-tertiary text-navy tabular-nums`}>
                    {unlockedCourses}/{courses.length} kurs açıq
                  </span>
                  {/* Energy, not coins — course unlocks spend energy (0098).
                      A failed balance read shows "—", never a misleading 0. */}
                  <Link
                    href="/coin-qazan"
                    className={`${PILL} bg-sand/70 text-navy transition hover:bg-sand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
                  >
                    <EnergyIcon width={13} height={13} aria-hidden />
                    {balance != null ? formatCoinBalance(balance) : '—'} enerji
                  </Link>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {featuredCourse && (
                  <Link
                    href={`/oyrenme/${featuredCourse.id}`}
                    className={`${buttonVariants({ variant: 'primary', size: 'lg' })} glow-primary rounded-full`}
                  >
                    {passedTopics > 0 ? 'Dərsə davam et' : 'Dərsə başla'}
                  </Link>
                )}
                <Link
                  href="/chat"
                  className={`${buttonVariants({ variant: 'outline', size: 'lg' })} rounded-full border-navy/25 text-navy hover:bg-navy/5`}
                >
                  AI köməkçidən soruş
                </Link>
              </div>
            </div>

            {/* Same static seal as the home hero. Desktop only — on a phone the
                hero needs the full width for type, not decoration. */}
            <div className="hidden justify-center md:col-span-5 md:flex">
              <div className="editorial-seal flex size-40 items-center justify-center rounded-full shadow-lg">
                <AwardIcon width={64} height={64} aria-hidden />
              </div>
            </div>
          </section>
        ) : (
          <section className="grid grid-cols-1 items-center gap-8 md:grid-cols-12">
            <div className="space-y-6 md:col-span-7">
              <Eyebrow>Öyrənmə mərkəzi</Eyebrow>
              <h1 className="text-[32px] font-semibold leading-[1.15] text-navy md:text-[44px]">
                Kurslar <span className="text-primary">hazırlanır</span>.
              </h1>
              <p className="max-w-xl text-[18px] leading-relaxed text-on-surface-variant">
                Hələ dərc edilmiş kurs yoxdur. Yol hərəkəti qaydaları üzrə kurslar tezliklə burada
                görünəcək — o vaxta qədər sualını AI köməkçiyə verə bilərsən.
              </p>
              <Link
                href="/chat"
                className={`${buttonVariants({ variant: 'primary', size: 'lg' })} glow-primary rounded-full`}
              >
                AI köməkçiyə sual ver
              </Link>
            </div>
            <div className="hidden justify-center md:col-span-5 md:flex">
              <div className="editorial-seal flex size-40 items-center justify-center rounded-full shadow-lg">
                <AwardIcon width={64} height={64} aria-hidden />
              </div>
            </div>
          </section>
        )}

        {hasCourses && (
          <section>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow>Kurslar</Eyebrow>
                <h2 className="mt-2 text-[28px] font-semibold leading-tight text-navy md:text-[40px]">
                  Hər kurs bir mövzu blokudur.
                </h2>
              </div>
              <Link
                href="/coin-qazan"
                className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-primary transition-[gap] hover:gap-2.5"
              >
                Enerji qazan
                <ArrowRightIcon width={13} height={13} aria-hidden />
              </Link>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 md:gap-6">
              {courses.map((course, i) => {
                // "Empty" wins over "locked": a course with nothing published
                // in it isn't a thing to sell yet.
                const isEmpty = course.totalTopics === 0;
                const isLocked = !isEmpty && !course.isUnlocked;
                const isOpen = !isEmpty && course.isUnlocked;
                const body = <CourseCardBody course={course} index={i} />;

                if (isLocked) {
                  // UnlockCourseCard renders the whole card as the <button> and
                  // appends its own hover/focus-visible treatment.
                  return (
                    <UnlockCourseCard
                      key={course.id}
                      courseId={course.id}
                      title={course.title}
                      price={course.price}
                      balance={balance}
                      className={`${CARD_BASE} ${CARD_SURFACE} hover:shadow-md`}
                    >
                      {body}
                    </UnlockCourseCard>
                  );
                }

                if (isOpen) {
                  return (
                    <Link
                      key={course.id}
                      href={`/oyrenme/${course.id}`}
                      className={`${CARD_BASE} ${CARD_SURFACE} transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0`}
                    >
                      {body}
                    </Link>
                  );
                }

                return (
                  <div
                    key={course.id}
                    className={`${CARD_BASE} border border-dashed border-border/60 bg-surface/60`}
                  >
                    {body}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {hasCourses && (
          // Full-bleed dark band between two pale sections — the editorial
          // rhythm device the home page uses for its numbers. Every figure is
          // derived from real published rows; there is no time-tracking table
          // and no certificate entity, so no "study time" / "certificates".
          <section className="editorial-stats-band rounded-[40px] px-8 py-12 md:px-16 md:py-16">
            <div className="grid grid-cols-2 gap-10 text-center md:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label}>
                  <p className="editorial-display text-[34px] font-bold leading-none tabular-nums text-sand md:text-[48px]">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-[0.1em] opacity-60 md:text-[12px]">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {featuredCourse && syllabus.length > 0 && (
          <section>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Eyebrow>Dərs proqramı</Eyebrow>
                <h2 className="mt-2 max-w-2xl text-[28px] font-semibold leading-tight text-navy md:text-[40px]">
                  {featuredCourse.title}
                </h2>
              </div>
              <Link
                href={`/oyrenme/${featuredCourse.id}`}
                className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-primary transition-[gap] hover:gap-2.5"
              >
                Bütün mövzular
                <ArrowRightIcon width={13} height={13} aria-hidden />
              </Link>
            </div>

            <ul className="mt-8 grid gap-3 md:grid-cols-2">
              {syllabus.map((topic, i) => {
                const num = String(i + 1).padStart(2, '0');
                const href = `/oyrenme/${featuredCourse.id}/${topic.id}`;
                const isPassed = topic.passed;
                const isActive = topic.isUnlocked && !topic.passed;

                if (isPassed) {
                  return (
                    <li key={topic.id}>
                      <Link
                        href={href}
                        className="group flex items-center gap-4 rounded-2xl border border-border/40 bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sage/40 text-teal-deep">
                          <CheckIcon width={18} height={18} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-navy">
                            {topic.title}
                          </span>
                          <span className="mt-0.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-teal-deep">
                            {num} · Tamamlanıb
                            {topic.bestScore != null ? ` · ${topic.bestScore}%` : ''}
                          </span>
                        </span>
                        <ArrowRightIcon
                          width={16}
                          height={16}
                          aria-hidden
                          className="shrink-0 text-on-surface-variant transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transform-none"
                        />
                      </Link>
                    </li>
                  );
                }

                if (isActive) {
                  return (
                    <li key={topic.id}>
                      <Link
                        href={href}
                        className="group flex items-center gap-4 rounded-2xl border border-primary/40 bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
                          <PlayIcon width={18} height={18} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-navy">
                            {topic.title}
                          </span>
                          <span className="mt-0.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-primary">
                            {num} · Davam edir
                            {topic.attempts > 0 ? ` · ${topic.attempts} cəhd` : ''}
                          </span>
                        </span>
                        {/* Visual CTA only — the whole row is the link, so this
                            must not be a second focusable element. */}
                        <span
                          aria-hidden
                          className="shrink-0 rounded-full bg-primary px-4 py-1.5 text-[12px] font-bold text-on-primary"
                        >
                          Davam et
                        </span>
                      </Link>
                    </li>
                  );
                }

                return (
                  <li key={topic.id}>
                    <div
                      aria-disabled="true"
                      className="flex items-center gap-4 rounded-2xl border border-dashed border-border/60 bg-surface/50 p-4"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface-tertiary text-on-surface-variant">
                        <LockIcon width={16} height={16} aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium text-on-surface-variant">
                          {topic.title}
                        </p>
                        <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant">
                          {num} · Bağlı
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {hiddenTopics > 0 && (
              <p className="mt-4 text-[13px] text-on-surface-variant">
                Bu kursda daha {hiddenTopics} mövzu var —{' '}
                <Link
                  href={`/oyrenme/${featuredCourse.id}`}
                  className="font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  hamısına bax
                </Link>
                .
              </p>
            )}
          </section>
        )}
      </div>

      <div className="mt-16">
        <Footer />
      </div>
    </div>
  );
}
