import Link from 'next/link';
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
          <h1 className="text-[18px] font-bold text-navy">{title}</h1>
          <p className="mt-1 max-w-sm text-body-md text-on-surface-variant">{description}</p>
        </div>

        <div className="grid w-full grid-cols-2 gap-3 pt-2">
          <div className="rounded-3xl border border-border/40 bg-surface p-4 shadow-sm">
            <p className="text-label-sm text-on-surface-variant">Cəhdlər</p>
            <p className="mt-1 text-2xl font-extrabold text-navy">{totalAttempts}</p>
          </div>
          <div className="rounded-3xl border border-border/40 bg-surface p-4 shadow-sm">
            <p className="text-label-sm text-on-surface-variant">Açıq Modullar</p>
            <p className="mt-1 text-2xl font-extrabold text-navy">
              {unlockedCount}/{topics.length}
            </p>
          </div>
        </div>
      </section>

      <section className="px-4 pt-6">
        <h2 className="mb-3 text-[17px] font-bold text-navy">Dərs Proqramı</h2>

        {topics.length === 0 ? (
          <div className="rounded-3xl border border-border/40 bg-surface px-6 py-10 text-center shadow-sm">
            <h3 className="text-[17px] font-semibold text-navy">Mövzular hazırlanır</h3>
            <p className="mx-auto mt-2 max-w-xs text-body-md text-on-surface-variant">
              Bu kursda hələ dərc edilmiş mövzu yoxdur. Tezliklə burada görünəcək.
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 [&>li]:min-w-0">
            {/* [&>li]:min-w-0 is REQUIRED: grid items default to min-width:auto,
                so a topic row's intrinsic width (icon + pill + text) forces the
                track wider than the viewport and the card overflows off-screen.
                With min-w-0 the track constrains the row and the flex text
                span's own min-w-0 + truncate actually engage. */}
            {topics.map((topic, i) => {
              const num = String(i + 1).padStart(2, '0');
              const href = `/oyrenme/${courseId}/${topic.id}`;

              if (topic.passed) {
                return (
                  <li key={topic.id}>
                    <Link
                      href={href}
                      className="group flex items-center gap-4 rounded-2xl border border-border/40 bg-surface p-4 transition active:scale-[0.98]"
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

              // Both gates: the sequential rule AND the paywall (0100).
              if (topic.isUnlocked && !topic.requiresUnlock) {
                return (
                  <li key={topic.id}>
                    <Link
                      href={href}
                      className="group flex items-center gap-4 rounded-2xl border border-primary/40 bg-surface p-4 shadow-sm transition active:scale-[0.98]"
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
                        {num} · {topic.requiresUnlock ? 'Kursu al' : 'Bağlı'}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {otherCourses.length > 0 && (
        <section className="pt-6 pb-2">
          <h2 className="mb-3 px-4 text-[17px] font-bold text-navy">Sizin Üçün Seçilənlər</h2>
          <div className="flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {otherCourses.map((course) => {
              const isEmpty = course.totalTopics === 0;
              const isLocked = !isEmpty && !course.isUnlocked;
              return (
                <Link
                  key={course.id}
                  href={`/oyrenme/${course.id}`}
                  className="flex w-56 shrink-0 flex-col gap-2 rounded-3xl border border-border/40 bg-surface p-4 shadow-sm transition active:scale-[0.98]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[15px] font-medium text-navy">{course.title}</h3>
                    {isLocked && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-sand/70 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-navy">
                        <LockIcon width={11} height={11} aria-hidden />
                        Kilidli
                      </span>
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
                        className="h-full rounded-full bg-primary transition-all duration-500"
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
    </div>
  );
}
