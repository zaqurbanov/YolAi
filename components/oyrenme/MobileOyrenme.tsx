'use client';

import Link from 'next/link';
import MobileBottomTabBar from '@/components/home/MobileBottomTabBar';
import FeatureRail from '@/components/home/FeatureRail';
import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  AwardIcon,
  LockIcon,
  PlayIcon,
  RulesIcon,
  CoinIcon,
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
      hint: s.unlockedCourses < s.totalCourses ? 'qalanları coinlə aç' : 'hamısı açıqdır',
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
            <p className="mt-1.5 text-xs leading-relaxed text-on-surface-variant font-normal">
              {featuredCourse?.description ??
                'Hələ dərc edilmiş kurs yoxdur. Tezliklə burada görünəcək.'}
            </p>
          </div>
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

        {/* Sizin Üçün Seçilənlər (Recommended Rail) */}
        <section className="pt-2">
          <h2 className="text-lg font-bold text-on-surface mb-3">Sizin Üçün Seçilənlər</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4">
            {/* Card 1 */}
            <div className="w-64 shrink-0 bg-surface border border-outline-variant/40 rounded-2xl overflow-hidden flex flex-col group cursor-pointer">
              <div className="relative h-32 w-full bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[var(--accent)]/30 via-transparent to-transparent opacity-80" />
                <div className="absolute top-3 left-3 bg-primary/20/90 backdrop-blur-md border border-primary/30 text-primary text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                  YENİ
                </div>
              </div>
              <div className="p-3.5">
                <h3 className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">
                  Avtonom Sürüş Texnologiyaları
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">Gələcəyin ağıllı sürüş və təhlükəsizlik sistemləri.</p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="w-64 shrink-0 bg-surface border border-outline-variant/40 rounded-2xl overflow-hidden flex flex-col group cursor-pointer">
              <div className="relative h-32 w-full bg-gradient-to-br from-slate-800 via-teal-950 to-slate-900 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-[var(--secondary)]/20 via-transparent to-transparent opacity-80" />
              </div>
              <div className="p-3.5">
                <h3 className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">
                  Sürüş Təhlükəsizliyi Qaydaları
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">Ekstremal hava şəraitində idarəetmə prinsipləri.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Fixed Bottom Navigation */}
      <MobileBottomTabBar />
    </div>
  );
}
