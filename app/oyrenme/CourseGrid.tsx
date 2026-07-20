import { Chip } from '@heroui/react';
import { ACCENT_STYLES } from '@/components/CategoryCard';
import { CoinIcon, LockIcon } from '@/components/icons';
import type { CourseSummary } from '@/lib/quiz/lessons';

interface CourseGridProps {
  courses: CourseSummary[];
}

// Server component: Phase 1 has no interactive affordance on a course card.
// The unlock purchase flow is Phase 3 and the learn -> test flow is Phase 2,
// so there is no client state to hold and nothing to ship to the browser.
// Locked courses show their price as read-only information only.
//
// Cards are deliberately NOT links: /oyrenme/[courseId] does not exist yet,
// and a card that navigates to a 404 is worse than one that doesn't move.
export default function CourseGrid({ courses }: CourseGridProps) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course, i) => {
        const accent = ACCENT_STYLES[i % ACCENT_STYLES.length];

        // "Empty" wins over "locked": a course with nothing published in it
        // isn't a thing to sell yet.
        const isEmpty = course.totalTopics === 0;
        const isLocked = !isEmpty && !course.isUnlocked;
        const isOpen = !isEmpty && course.isUnlocked;

        return (
          <div
            key={course.id}
            className={`topic-card-in motion-reduce:animate-none glass-card flex h-full flex-col border border-transparent border-l-4 ${accent.border} p-6`}
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3
                className={`text-headline-md text-[20px] ${isOpen ? '' : 'text-on-surface-variant'}`}
              >
                {course.title}
              </h3>

              {isLocked && (
                <Chip size="sm" variant="soft" color="warning" className="mono-label shrink-0">
                  <LockIcon width={13} height={13} />
                  Kilidli
                </Chip>
              )}
              {isEmpty && (
                <Chip size="sm" variant="soft" color="default" className="mono-label shrink-0">
                  Tezliklə
                </Chip>
              )}
            </div>

            {course.description && (
              <p className="text-body-md text-on-surface-variant">{course.description}</p>
            )}

            <div className="mt-4 flex-1">
              {isOpen && (
                <>
                  <div className="mb-1.5 flex items-center justify-between text-label-sm text-on-surface-variant">
                    <span>İrəliləyiş</span>
                    <span>
                      {course.passedTopics}/{course.totalTopics} mövzu
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
                    <div
                      className="h-full rounded-full bg-go-green transition-all"
                      style={{ width: `${course.progressPct}%` }}
                    />
                  </div>
                </>
              )}

              {isLocked && (
                <p className="text-label-sm text-on-surface-variant">
                  Bu kursda {course.totalTopics} mövzu var. Birdəfəlik ödənişlə həmişəlik açılır.
                </p>
              )}

              {isEmpty && (
                <p className="text-label-sm text-on-surface-variant">
                  Hələ mövzu yoxdur — bu kurs hazırlanır.
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-outline-variant/40 pt-3">
              <span className={`text-legal-citation ${accent.citation}`}>
                {course.isFree ? 'Pulsuz' : 'Kurs'}
              </span>

              {isLocked && (
                <span className="flex items-center gap-1 text-label-sm font-semibold text-safety-yellow">
                  <CoinIcon width={15} height={15} />
                  {course.price}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
