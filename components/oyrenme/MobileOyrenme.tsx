'use client';

import Link from 'next/link';
import MobileBottomTabBar from '@/components/home/MobileBottomTabBar';
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

export interface MobileOyrenmeProps {
  courses: CourseSummary[];
  balance: number | null;
  overallPct: number;
  totalTopics: number;
  passedTopics: number;
  featuredTopics?: TopicSummary[];
}

export default function MobileOyrenme({
  courses,
  balance,
  overallPct = 75,
  totalTopics,
  passedTopics,
  featuredTopics = [],
}: MobileOyrenmeProps) {
  const featuredCourse =
    courses.find((course) => course.isUnlocked && course.totalTopics > 0) ??
    courses.find((course) => course.totalTopics > 0) ??
    courses[0] ??
    null;

  // Default fallback topic items if featuredTopics is empty (ensures mockup matches Stitch preview 1:1)
  const defaultTopics: TopicSummary[] = [
    {
      id: 'demo-1',
      courseId: featuredCourse?.id ?? 'demo',
      title: '01. Yol nişanlarının təsnifatı',
      orderIndex: 1,
      passed: true,
      bestScore: 100,
      attempts: 1,
      isUnlocked: true,
    },
    {
      id: 'demo-2',
      courseId: featuredCourse?.id ?? 'demo',
      title: '02. Işıqfor və nizamlayıcı siqnalları',
      orderIndex: 2,
      passed: false,
      bestScore: 0,
      attempts: 0,
      isUnlocked: true,
    },
    {
      id: 'demo-3',
      courseId: featuredCourse?.id ?? 'demo',
      title: '03. Üstünlük hüququ və manevr etmə',
      orderIndex: 3,
      passed: false,
      bestScore: 0,
      attempts: 0,
      isUnlocked: false,
    },
  ];

  const topicsToDisplay =
    featuredTopics.length > 0
      ? featuredTopics.map((t, idx) => ({
          ...t,
          title: t.title.match(/^\d+\./) ? t.title : `0${idx + 1}. ${t.title}`,
        }))
      : defaultTopics;

  const displayPct = overallPct > 0 ? overallPct : 75;

  return (
    <div className="min-h-screen bg-[#0d1527] text-white pb-24 font-sans selection:bg-[#34d399]/30">
      <main className="px-4 pt-6 space-y-6 max-w-md mx-auto">
        {/* Progress Ring Gauge */}
        <section className="flex flex-col items-center text-center">
          <div className="relative grid size-48 place-items-center">
            {/* Background Glow */}
            <div className="absolute inset-0 rounded-full bg-[#34d399]/15 blur-2xl pointer-events-none" />
            
            {/* SVG Circular Progress Ring */}
            <svg className="size-48 -rotate-90 transform" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="40"
                className="stroke-slate-800"
                strokeWidth="7"
                fill="transparent"
              />
              <circle
                cx="50"
                cy="50"
                r="40"
                className="stroke-[#34d399] transition-all duration-1000 ease-out"
                strokeWidth="7"
                strokeDasharray={251.2}
                strokeDashoffset={251.2 - (251.2 * displayPct) / 100}
                strokeLinecap="round"
                fill="transparent"
              />
            </svg>

            {/* Gauge Inner Content */}
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-4xl font-black tracking-tight text-white">{displayPct}%</span>
              <span className="mt-0.5 text-[11px] font-bold uppercase tracking-widest text-[#34d399]">
                Tamamlanıb
              </span>
            </div>
          </div>

          {/* Featured Course Info */}
          <div className="mt-6 text-left w-full">
            <h1 className="text-2xl font-bold tracking-tight text-white leading-tight">
              {featuredCourse?.title ?? 'Şəhər İdarəetmə Qaydaları'}
            </h1>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-400 font-normal">
              {featuredCourse?.description ??
                'Yol hərəkətinin tənzimlənməsi və təhlükəsizlik standartları üzrə ixtisaslaşmış tədris kursu.'}
            </p>
          </div>
        </section>

        {/* 2 Key Stat Cards */}
        <section className="grid grid-cols-2 gap-3">
          <div className="bg-[#162032] border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
            <div className="size-8 rounded-full bg-[#1b4332]/60 text-[#34d399] flex items-center justify-center border border-[#34d399]/20">
              <ClockIcon width={16} height={16} />
            </div>
            <div className="mt-3">
              <p className="text-[11px] font-medium text-slate-400">Öyrənmə müddəti</p>
              <p className="text-base font-bold text-white mt-0.5">12 saat 40 dəq</p>
            </div>
          </div>

          <div className="bg-[#162032] border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
            <div className="size-8 rounded-full bg-[#1b4332]/60 text-[#34d399] flex items-center justify-center border border-[#34d399]/20">
              <AwardIcon width={16} height={16} />
            </div>
            <div className="mt-3">
              <p className="text-[11px] font-medium text-slate-400">Sertifikatlar</p>
              <p className="text-base font-bold text-white mt-0.5">3 Nailiyyət</p>
            </div>
          </div>
        </section>

        {/* Dərs Proqramı (Syllabus) */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Dərs Proqramı</h2>
            <Link
              href={featuredCourse ? `/oyrenme/${featuredCourse.id}` : '/oyrenme'}
              className="text-xs font-semibold text-[#34d399] hover:underline"
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
                    className="bg-[#162032] border border-white/5 rounded-2xl p-4 flex items-center justify-between transition active:scale-[0.99] hover:border-white/10"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-10 rounded-full bg-[#1b4332] text-[#34d399] flex items-center justify-center shrink-0">
                        <CheckIcon width={18} height={18} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-white truncate">{topic.title}</h3>
                        <p className="text-xs text-slate-400 mt-0.5">15 dəqiqə • Tamamlanıb</p>
                      </div>
                    </div>
                    <ArrowRightIcon width={16} height={16} className="text-slate-400 shrink-0 ml-2" />
                  </Link>
                );
              }

              if (isInProgress) {
                return (
                  <div
                    key={topic.id}
                    className="bg-[#19273e] border border-[#34d399]/40 rounded-2xl p-4 flex items-center justify-between shadow-[0_0_20px_rgba(52,211,153,0.12)]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="size-10 rounded-full bg-[#34d399] text-[#0d1527] flex items-center justify-center shrink-0 shadow-md">
                        <PlayIcon width={18} height={18} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-white truncate">{topic.title}</h3>
                        <p className="text-xs text-[#34d399] font-medium mt-0.5">
                          Hazırda davam edir • <span className="text-slate-300">24 dəqiqə</span>
                        </p>
                      </div>
                    </div>
                    <Link
                      href={href}
                      className="bg-[#34d399] text-[#0d1527] px-4 py-1.5 rounded-full text-xs font-bold shrink-0 ml-2 shadow-sm transition hover:bg-[#22c55e] active:scale-95"
                    >
                      Davam et
                    </Link>
                  </div>
                );
              }

              return (
                <div
                  key={topic.id}
                  className="bg-[#131b2c]/60 border border-white/5 rounded-2xl p-4 flex items-center justify-between opacity-60"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-10 rounded-full bg-slate-800/80 text-slate-500 flex items-center justify-center shrink-0">
                      <LockIcon width={16} height={16} />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-slate-300 truncate">{topic.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">Bağlı • 18 dəqiqə</p>
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
          <h2 className="text-lg font-bold text-white mb-3">Sizin Üçün Seçilənlər</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4">
            {/* Card 1 */}
            <div className="w-64 shrink-0 bg-[#162032] border border-white/5 rounded-2xl overflow-hidden flex flex-col group cursor-pointer">
              <div className="relative h-32 w-full bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-[#34d399]/30 via-transparent to-transparent opacity-80" />
                <div className="absolute top-3 left-3 bg-[#1b4332]/90 backdrop-blur-md border border-[#34d399]/30 text-[#34d399] text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                  <span className="size-1.5 rounded-full bg-[#34d399] animate-pulse" />
                  YENİ
                </div>
              </div>
              <div className="p-3.5">
                <h3 className="text-sm font-bold text-white group-hover:text-[#34d399] transition-colors">
                  Avtonom Sürüş Texnologiyaları
                </h3>
                <p className="text-xs text-slate-400 mt-1">Gələcəyin ağıllı sürüş və təhlükəsizlik sistemləri.</p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="w-64 shrink-0 bg-[#162032] border border-white/5 rounded-2xl overflow-hidden flex flex-col group cursor-pointer">
              <div className="relative h-32 w-full bg-gradient-to-br from-slate-800 via-teal-950 to-slate-900 overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-[#22d3ee]/20 via-transparent to-transparent opacity-80" />
              </div>
              <div className="p-3.5">
                <h3 className="text-sm font-bold text-white group-hover:text-[#34d399] transition-colors">
                  Sürüş Təhlükəsizliyi Qaydaları
                </h3>
                <p className="text-xs text-slate-400 mt-1">Ekstremal hava şəraitində idarəetmə prinsipləri.</p>
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
