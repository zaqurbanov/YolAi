'use client';

import { useState } from 'react';
import Link from 'next/link';
import FeatureRail from '@/components/home/FeatureRail';
import { useSnapRail } from '@/components/home/SnapRail';
import UnlockCourseCard from '@/app/oyrenme/UnlockCourseCard';
import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  AwardIcon,
  LockIcon,
  PlayIcon,
  EnergyIcon,
} from '@/components/icons';
import { formatCoinBalance } from '@/lib/format/coins';
import type { CourseSummary, TopicSummary } from '@/lib/quiz/lessons';

interface LearningStats {
  overallPct: number;
  totalTopics: number;
  passedTopics: number;
  totalCourses: number;
  unlockedCourses: number;
  /** Courses where every published topic has been passed. */
  completedCourses: number;
  /** Total quiz attempts across the featured course's topics. */
  featuredAttempts: number;
}

// Each card states what it measures AND the raw counts behind it, so a figure
// can always be traced back to real rows rather than read as a vanity number.
const STAT_CARDS: ReadonlyArray<{
  key: string;
  label: string;
  icon: typeof AwardIcon;
  value: (s: LearningStats) => { value: string; hint: string };
}> = [
  {
    key: 'completion',
    label: 'Tamamlanma',
    icon: CheckIcon,
    value: (s) => ({
      value: `${s.overallPct}%`,
      hint: `${s.passedTopics}/${s.totalTopics} mövzu`,
    }),
  },
  {
    key: 'certificates',
    label: 'Bitirilmiş kurslar',
    icon: AwardIcon,
    // The closest thing to a real "certificate" this app has: a course whose
    // every published topic is passed. No certificate table exists.
    value: (s) => ({
      value: String(s.completedCourses),
      hint: s.totalCourses > 0 ? `${s.totalCourses} kursdan` : 'kurs yoxdur',
    }),
  },
  {
    key: 'unlocked',
    label: 'Açıq kurslar',
    icon: PlayIcon,
    value: (s) => ({
      value: `${s.unlockedCourses}/${s.totalCourses}`,
      hint: s.unlockedCourses < s.totalCourses ? 'qalanları enerji ilə aç' : 'hamısı açıqdır',
    }),
  },
  {
    key: 'attempts',
    label: 'Test cəhdləri',
    icon: ClockIcon,
    value: (s) => ({
      value: String(s.featuredAttempts),
      hint: 'cari kursda',
    }),
  },
];

// One course card body, shared by the slider and the expanded list. Prices are
// ENERGY since 0098 — course unlocks spend energy, never coins — so a locked
// card shows an energy price, an open one shows its topic progress, and an
// empty ("Tezliklə") one is not a thing to sell yet.
function CourseCardContent({ course }: { course: CourseSummary }) {
  const isEmpty = course.totalTopics === 0;
  const isLocked = !isEmpty && !course.isUnlocked;
  const isOpen = !isEmpty && course.isUnlocked;

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <h3
          className={`truncate text-sm font-bold ${isOpen ? 'text-on-surface' : 'text-on-surface-variant'}`}
        >
          {course.title}
        </h3>
        {isLocked && <LockIcon width={14} height={14} className="shrink-0 text-safety-yellow" />}
        {isEmpty && (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-on-surface-variant">
            Tezliklə
          </span>
        )}
      </div>

      {course.description && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-on-surface-variant">
          {course.description}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-outline-variant/40 pt-3">
        {isOpen && (
          <span className="text-xs text-on-surface-variant">
            {course.passedTopics}/{course.totalTopics} mövzu
          </span>
        )}
        {isLocked && (
          <span className="flex items-center gap-1 text-xs font-bold text-safety-yellow">
            <EnergyIcon width={14} height={14} />
            {formatCoinBalance(course.price)}
          </span>
        )}
        {isEmpty && <span className="text-xs text-on-surface-variant">Hazırlanır</span>}
        {isOpen && <ArrowRightIcon width={15} height={15} className="shrink-0 text-on-surface-variant" />}
      </div>
    </>
  );
}

// Renders one course in its right wrapper — the same three-way split the
// desktop CourseGrid uses. A LOCKED card is wrapped in <UnlockCourseCard>
// (client): the whole card is the trigger and owns the energy purchase dialog,
// so pricing, the balance rows and the «Enerji qazan» exit behave identically
// to the desktop unlock. `wide` is true in the expanded list (card fills the
// row), false in the slider (fixed-width, shrink-0). UnlockCourseCard appends
// `w-full` to its trigger, so a locked slider card is wrapped in an explicit
// width div rather than relying on class-order to beat w-full.
const CARD_BASE =
  'flex min-h-40 flex-col border border-outline-variant/40 bg-surface rounded-2xl p-4';

function renderCourseCard(course: CourseSummary, balance: number | null, wide: boolean) {
  const isEmpty = course.totalTopics === 0;
  const isLocked = !isEmpty && !course.isUnlocked;
  const isOpen = !isEmpty && course.isUnlocked;
  // snap-start only on the slider branch — the expanded list (wide) is a plain
  // stacked layout, not a snap rail, and must not register snap points.
  const widthClass = wide ? 'w-full' : 'w-72 shrink-0 snap-start';
  const content = <CourseCardContent course={course} />;

  if (isLocked) {
    return (
      <div key={course.id} className={widthClass}>
        <UnlockCourseCard
          courseId={course.id}
          title={course.title}
          price={course.price}
          balance={balance}
          className={CARD_BASE}
        >
          {content}
        </UnlockCourseCard>
      </div>
    );
  }

  if (isOpen) {
    return (
      <Link
        key={course.id}
        href={`/oyrenme/${course.id}`}
        className={`${CARD_BASE} ${widthClass} transition active:scale-[0.99]`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div key={course.id} className={`${CARD_BASE} ${widthClass}`}>
      {content}
    </div>
  );
}

export interface MobileOyrenmeProps {
  courses: CourseSummary[];
  balance: number | null;
  overallPct: number;
  totalTopics: number;
  passedTopics: number;
  featuredTopics?: TopicSummary[];
  totalCourses: number;
  unlockedCourses: number;
  completedCourses: number;
}

export default function MobileOyrenme({
  courses,
  balance,
  overallPct,
  totalTopics,
  passedTopics,
  featuredTopics = [],
  totalCourses,
  unlockedCourses,
  completedCourses,
}: MobileOyrenmeProps) {
  // "Bütün kurslar" expands the course slider into the full stacked list —
  // client state only, no extra route (a route would cost another Vercel
  // function and the deployment is already past the Hobby cap — CLAUDE.md).
  const [showAllCourses, setShowAllCourses] = useState(false);

  // One-card-per-drag snap for the Kurslar slider below. `active` is unused
  // here (no dots on this rail) — destructured via `railProps` only, and
  // useSnapRail returns a stable object so skipping the rest is safe.
  const { railProps: kurslarRailProps } = useSnapRail<HTMLDivElement>(courses.length);

  const stats: LearningStats = {
    overallPct,
    totalTopics,
    passedTopics,
    totalCourses,
    unlockedCourses,
    completedCourses,
    featuredAttempts: featuredTopics.reduce((sum, t) => sum + t.attempts, 0),
  };
  const featuredCourse =
    courses.find((course) => course.isUnlocked && course.totalTopics > 0) ??
    courses.find((course) => course.totalTopics > 0) ??
    courses[0] ??
    null;

  // No demo fallback. The previous version substituted three invented topics
  // ("01. Yol nişanlarının təsnifatı"…) whenever the real list was empty, so a
  // brand-new account saw a syllabus it did not have. An empty course now
  // renders an empty state instead.
  const topicsToDisplay = featuredTopics.map((t, idx) => ({
    ...t,
    title: t.title.match(/^\d+\./) ? t.title : `0${idx + 1}. ${t.title}`,
  }));

  // Real percentage, including 0 — a fresh account is genuinely at 0%.
  const displayPct = overallPct;

  return (
    <div className="editorial min-h-screen bg-background pb-24 text-on-surface selection:bg-primary/30">
      <main className="px-4 pt-6 space-y-6 max-w-md mx-auto">
        {/* Progress Ring Gauge */}
        <section className="flex flex-col items-center text-center">
          <div className="relative grid size-48 place-items-center">
            {/* Background Glow */}
            <div className="absolute inset-0 rounded-full bg-primary/15 blur-2xl pointer-events-none" />
            
            {/* SVG Circular Progress Ring */}
            <svg className="size-48 -rotate-90 transform" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                className="stroke-[var(--surface-tertiary)]"
                strokeWidth="7"
                fill="transparent"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                className="stroke-[var(--accent)] transition-all duration-1000 ease-out"
                strokeWidth="7"
                strokeDasharray={251.2}
                strokeDashoffset={251.2 - (251.2 * displayPct) / 100}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>

            {/* Gauge Inner Content */}
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-4xl font-black tracking-tight text-on-surface">{displayPct}%</span>
              <span className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-primary">
                Tamamlanıb
              </span>
            </div>
          </div>

          {/* Featured Course Info */}
          <div className="mt-6 text-left w-full">
            <h1 className="text-2xl font-bold tracking-tight text-on-surface leading-tight">
              {featuredCourse?.title ?? 'Kurslar hazırlanır'}
            </h1>
            {/* The empty-state copy belongs ONLY to the truly-empty case — a
                published course with a null description used to fall through to
                "Hələ dərc edilmiş kurs yoxdur" under a real title, which was the
                bug. A real course with no description gets a neutral fallback. */}
            <p className="mt-1.5 text-xs leading-relaxed text-on-surface-variant font-normal">
              {courses.length === 0
                ? 'Hələ dərc edilmiş kurs yoxdur. Tezliklə burada görünəcək.'
                : (featuredCourse?.description ??
                  'Kurs materiallarını bitirərək növbəti mövzuya keçin.')}
            </p>
          </div>
        </section>

        {/* Kurslar — real published courses, right under the featured course
            title (this is the spot that used to print "Hələ dərc edilmiş kurs
            yoxdur" under a real course with a null description). Collapsed: a
            horizontal card slider (swipeable). Expanded via "Bütün kurslar":
            every course stacked with its energy price. This replaced an invented
            "Sizin Üçün Seçilənlər" rail whose two cards ("Avtonom Sürüş
            Texnologiyaları", "Sürüş Təhlükəsizliyi Qaydaları") pointed at
            courses that do not exist. */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-on-surface">Kurslar</h2>
            {courses.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAllCourses((v) => !v)}
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                {showAllCourses ? 'Yığcam görünüş' : 'Bütün kurslar'}
                <ArrowRightIcon
                  width={14}
                  height={14}
                  className={`transition-transform ${showAllCourses ? 'rotate-90' : ''}`}
                />
              </button>
            )}
          </div>

          {showAllCourses ? (
            <div className="space-y-3">{courses.map((course) => renderCourseCard(course, balance, true))}</div>
          ) : (
            <div
              {...kurslarRailProps}
              className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-none snap-x snap-mandatory touch-pan-y select-none"
            >
              {courses.length > 0 ? (
                courses.map((course) => renderCourseCard(course, balance, false))
              ) : (
                <p className="text-xs text-on-surface-variant">
                  Hələ dərc edilmiş kurs yoxdur. Tezliklə burada görünəcək.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Stat rail. Every figure below is DERIVED FROM REAL DATA — the two
            cards this replaced were invented ("12 saat 40 dəq", "3 Nailiyyət"):
            there is no time-tracking table anywhere in the app and no
            certificate entity, so neither number could ever have been true.
            Anything that cannot be computed from lesson_courses /
            lesson_topics / user_topic_progress is simply not shown. */}
        <section>
          <FeatureRail>
            {STAT_CARDS.map((card) => {
              const Icon = card.icon;
              const stat = card.value(stats);
              return (
                <div
                  key={card.key}
                  className="flex h-full flex-col justify-between rounded-2xl border border-outline-variant/40 bg-surface p-4"
                >
                  <div className="flex size-9 items-center justify-center rounded-full border border-primary/20 bg-primary/15 text-primary">
                    <Icon width={17} height={17} />
                  </div>
                  <div className="mt-4">
                    <p className="text-[11px] font-medium text-on-surface-variant">{card.label}</p>
                    <p className="mt-0.5 text-[20px] font-bold text-on-surface tabular-nums">
                      {stat.value}
                    </p>
                    <p className="mt-0.5 text-[11px] text-on-surface-variant">{stat.hint}</p>
                  </div>
                </div>
              );
            })}
          </FeatureRail>
        </section>

        {/* Dərs Proqramı (Syllabus) */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-on-surface">Dərs Proqramı</h2>
            <Link
              href={featuredCourse ? `/oyrenme/${featuredCourse.id}` : '/oyrenme'}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Bütün dərslər
            </Link>
          </div>

          <div className="space-y-3">
            {topicsToDisplay.map((topic) => {
              const isCompleted = topic.passed;
              const isInProgress = topic.isUnlocked && !topic.passed;
              const href = featuredCourse ? `/oyrenme/${featuredCourse.id}/${topic.id}` : '#';

              if (isCompleted) {
                return (
                  <Link
                    key={topic.id}
                    href={href}
                    className="bg-surface border border-outline-variant/40 rounded-2xl p-4 flex items-center justify-between transition active:scale-[0.99] hover:border-outline-variant/40"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-10 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
                        <CheckIcon width={18} height={18} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-on-surface truncate">{topic.title}</h3>
                        <p className="text-xs text-on-surface-variant mt-0.5">15 dəqiqə • Tamamlanıb</p>
                      </div>
                    </div>
                    <ArrowRightIcon width={16} height={16} className="text-on-surface-variant shrink-0 ml-2" />
                  </Link>
                );
              }

              if (isInProgress) {
                return (
                  <div
                    key={topic.id}
                    className="bg-surface-tertiary border border-[var(--accent)]/40 rounded-2xl p-4 flex items-center justify-between shadow-[0_0_20px_rgba(52,211,153,0.12)]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-10 rounded-full bg-primary text-[var(--background)] flex items-center justify-center shrink-0 shadow-md">
                        <PlayIcon width={18} height={18} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-on-surface truncate">{topic.title}</h3>
                        <p className="text-xs text-primary font-medium mt-0.5">
                          Hazırda davam edir • <span className="text-slate-300">24 dəqiqə</span>
                        </p>
                      </div>
                    </div>
                    <Link
                      href={href}
                      className="bg-primary text-[var(--background)] px-4 py-1.5 rounded-full text-xs font-bold shrink-0 ml-2 shadow-sm transition hover:bg-[var(--go-green)] active:scale-95"
                    >
                      Davam et
                    </Link>
                  </div>
                );
              }

              return (
                <div
                  key={topic.id}
                  className="bg-surface-secondary/60 border border-outline-variant/40 rounded-2xl p-4 flex items-center justify-between opacity-60"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-10 rounded-full bg-slate-800/80 text-on-surface-variant flex items-center justify-center shrink-0">
                      <LockIcon width={16} height={16} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-slate-300 truncate">{topic.title}</h3>
                      <p className="text-xs text-on-surface-variant mt-0.5">Bağlı • 18 dəqiqə</p>
                    </div>
                  </div>
                  <LockIcon width={16} height={16} className="text-slate-600 shrink-0 ml-2" />
                </div>
              );
            })}
          </div>
        </section>

      </main>

    </div>
  );
}
