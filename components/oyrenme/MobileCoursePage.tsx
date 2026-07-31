import Link from 'next/link';
import { Chip } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import MobileBottomTabBar from '@/components/home/MobileBottomTabBar';
import ProgressRing from '@/components/oyrenme/ProgressRing';
import { ArrowRightIcon, CheckIcon, LockIcon, PlayIcon } from '@/components/icons';
import type { CourseSummary, TopicSummary } from '@/lib/quiz/lessons';

export interface MobileCoursePageProps {
  courseId: string;
  title: string;
  description: string;
  topics: TopicSummary[];
  passedCount: number;
  progressPct: number;
  /** getCourses() minus this course, for the "Sizin üçün seçilənlər" rail. */
  otherCourses: CourseSummary[];
}

// Mobile-only course-detail shell — the mockup screen this most closely
// matches (see legaldrive-design skill's "Academy (Öyrənmə) page — mobile").
// Rendered only inside the md:hidden wrapper in app/oyrenme/[courseId]/page.tsx;
// desktop/3D tree untouched. Built from the exact same `topics`/course data the
// desktop list already computes — no separate content source.
export default function MobileCoursePage({
  courseId,
  title,
  description,
  topics,
  passedCount,
  progressPct,
  otherCourses,
}: MobileCoursePageProps) {
  // Real, derived stat-card numbers (no time-tracking/certificate data exists
  // anywhere in lib/quiz/** — see task brief). Card 1: total attempts across
  // this course's topics (an effort signal, distinct from the ring). Card 2:
  // how many topics this user has unlocked so far (a progression signal,
  // distinct from "percent passed").
  const totalAttempts = topics.reduce((sum, t) => sum + t.attempts, 0);
  const unlockedCount = topics.filter((t) => t.isUnlocked).length;

  return (
    <div className="editorial flex flex-col pb-24">
      {/* No <header> here on purpose: the global NavBar is the single top bar
          on mobile (back button, "Akademiya" label, coin badge, account menu).
          This used to render a second stacked one. The course name lives in
          the <h1> below instead. */}

      <section className="flex flex-col items-center gap-4 px-4 pt-8 pb-2 text-center">
        <div className="relative flex items-center justify-center">
          <ProgressRing percent={progressPct} />
          <div className="absolute flex flex-col items-center">
            <span className="text-3xl font-extrabold text-primary">{progressPct}%</span>
            <span className="text-legal-citation text-on-surface-variant">tamamlanıb</span>
          </div>
        </div>
        <div>
          <h1 className="text-headline-md text-[20px]">{title}</h1>
          <p className="mt-1 max-w-sm text-body-md text-on-surface-variant">{description}</p>
        </div>

        <div className="grid w-full grid-cols-2 gap-3 pt-2">
          <div className="glass-card rounded-2xl p-4">
            <p className="text-label-sm text-on-surface-variant">Cəhdlər</p>
            <p className="mt-1 text-2xl font-extrabold text-on-surface">{totalAttempts}</p>
          </div>
          <div className="glass-card rounded-2xl p-4">
            <p className="text-label-sm text-on-surface-variant">Açıq Modullar</p>
            <p className="mt-1 text-2xl font-extrabold text-on-surface">
              {unlockedCount}/{topics.length}
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 pt-6">
        <h2 className="mb-3 text-headline-md text-[18px]">Dərs Proqramı</h2>

        {topics.length === 0 ? (
          <div className="glass-card rounded-2xl px-6 py-10 text-center">
            <h3 className="text-headline-md text-[17px]">Mövzular hazırlanır</h3>
            <p className="mx-auto mt-2 max-w-xs text-body-md text-on-surface-variant">
              Bu kursda hələ dərc edilmiş mövzu yoxdur. Tezliklə burada görünəcək.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-3">
            {topics.map((topic, i) => {
              const isActive = topic.isUnlocked && !topic.passed;
              const href = `/oyrenme/${courseId}/${topic.id}`;

              const badge = topic.passed ? (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-go-green/15 text-go-green">
                  <CheckIcon width={18} height={18} />
                </span>
              ) : isActive ? (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <PlayIcon width={16} height={16} />
                </span>
              ) : topic.isUnlocked ? (
                <span className="text-legal-citation flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  {i + 1}
                </span>
              ) : (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-tertiary text-on-surface-variant">
                  <LockIcon width={16} height={16} />
                </span>
              );

              const body = (
                <>
                  {badge}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        className={`text-headline-md text-[16px] ${topic.isUnlocked ? '' : 'text-on-surface-variant'}`}
                      >
                        {topic.title}
                      </h3>
                      {topic.passed && (
                        <Chip size="sm" variant="soft" color="success" className="mono-label shrink-0">
                          Tamamlanıb
                        </Chip>
                      )}
                      {!topic.isUnlocked && (
                        <Chip size="sm" variant="soft" color="default" className="mono-label shrink-0">
                          Kilidli
                        </Chip>
                      )}
                    </div>
                    <p className="mt-0.5 text-label-sm text-on-surface-variant">
                      {topic.passed
                        ? `Ən yaxşı nəticə: ${topic.bestScore} • ${topic.attempts} cəhd`
                        : !topic.isUnlocked
                          ? 'Açmaq üçün əvvəlki mövzunun testini keçin'
                          : topic.attempts > 0
                            ? `${topic.attempts} cəhd • ən yaxşı nəticə: ${topic.bestScore}`
                            : 'Oxu və testi keç'}
                    </p>
                  </div>
                  {isActive ? (
                    <Link
                      href={href}
                      className={buttonVariants({ variant: 'primary', size: 'sm' }) + ' glow-primary shrink-0'}
                    >
                      Davam et
                    </Link>
                  ) : topic.isUnlocked ? (
                    <ArrowRightIcon width={18} height={18} className="shrink-0 text-on-surface-variant" />
                  ) : null}
                </>
              );

              const rowClass = `glass-card flex items-center gap-3 rounded-2xl border p-4 ${
                isActive ? 'border-primary/40' : 'border-transparent'
              }`;

              return (
                <li key={topic.id}>
                  {topic.isUnlocked ? (
                    isActive ? (
                      <div className={rowClass}>{body}</div>
                    ) : (
                      <Link
                        href={href}
                        className={`${rowClass} transition-[transform,border-color] active:scale-[0.98] hover:border-primary/40`}
                      >
                        {body}
                      </Link>
                    )
                  ) : (
                    <div className={`${rowClass} opacity-60`}>{body}</div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {otherCourses.length > 0 && (
        <section className="pt-6 pb-2">
          <h2 className="mb-3 px-4 text-headline-md text-[18px]">Sizin Üçün Seçilənlər</h2>
          <div className="flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {otherCourses.map((course) => {
              const isEmpty = course.totalTopics === 0;
              const isLocked = !isEmpty && !course.isUnlocked;
              return (
                <Link
                  key={course.id}
                  href={`/oyrenme/${course.id}`}
                  className="glass-card flex w-56 shrink-0 flex-col gap-2 rounded-2xl p-4 transition-[transform,border-color] active:scale-[0.98]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-headline-md text-[15px]">{course.title}</h3>
                    {isLocked && (
                      <Chip size="sm" variant="soft" color="warning" className="mono-label shrink-0">
                        <LockIcon width={11} height={11} />
                      </Chip>
                    )}
                  </div>
                  {course.description && (
                    <p className="line-clamp-2 text-legal-citation text-on-surface-variant">
                      {course.description}
                    </p>
                  )}
                  {!isEmpty && course.isUnlocked && (
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
                      <div
                        className="h-full rounded-full bg-go-green transition-all duration-500"
                        style={{ width: `${course.progressPct}%` }}
                      />
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <MobileBottomTabBar />
    </div>
  );
}
