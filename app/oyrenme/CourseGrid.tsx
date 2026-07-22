import Link from 'next/link';
import { Chip } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { ACCENT_STYLES } from '@/components/CategoryCard';
import { CoinIcon, LockIcon } from '@/components/icons';
import type { CourseSummary } from '@/lib/quiz/lessons';
import UnlockCourseCard from './UnlockCourseCard';

interface CourseGridProps {
  courses: CourseSummary[];
  /** Display only. null when the balance read failed — it fails open. */
  balance: number | null;
}

// Server component. Only the LOCKED branch is interactive: it is wrapped in
// <UnlockCourseCard> (client), which turns the card into a real button and owns
// the coin purchase dialog. Free/open/empty cards ship no JS.
//
// Free and already-unlocked cards link to /oyrenme/[courseId] (the topic list),
// which exists as of Phase 2. A <Link> ships no JS, so this branch stays
// non-interactive in the "no hydration" sense. Empty ("Tezliklə") cards are
// still not links — there is nothing to show behind them.
export default function CourseGrid({ courses, balance }: CourseGridProps) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course, i) => {
        const accent = ACCENT_STYLES[i % ACCENT_STYLES.length];

        // "Empty" wins over "locked": a course with nothing published in it
        // isn't a thing to sell yet.
        const isEmpty = course.totalTopics === 0;
        const isLocked = !isEmpty && !course.isUnlocked;
        const isOpen = !isEmpty && course.isUnlocked;

        const cardClass = `topic-card-in motion-reduce:animate-none glass-card flex h-full flex-col border border-transparent border-l-4 ${accent.border} p-6`;
        const cardStyle = { animationDelay: `${i * 80}ms` };

        const content = (
          <>
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

            {isLocked && (
              // Looks like the primary action, but is a plain span: the whole
              // card is the button, so nothing inside it may be focusable.
              <span
                aria-hidden
                className={buttonVariants({ variant: 'primary', size: 'sm' }) + ' mt-4 w-full'}
              >
                Kursu aç
              </span>
            )}

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
          </>
        );

        if (isLocked) {
          return (
            <UnlockCourseCard
              key={course.id}
              courseId={course.id}
              title={course.title}
              price={course.price}
              balance={balance}
              className={cardClass}
              style={cardStyle}
            >
              {content}
            </UnlockCourseCard>
          );
        }

        if (isOpen) {
          return (
            <Link
              key={course.id}
              href={`/oyrenme/${course.id}`}
              className={`${cardClass} transition-[transform,border-color] hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
              style={cardStyle}
            >
              {content}
            </Link>
          );
        }

        return (
          <div key={course.id} className={cardClass} style={cardStyle}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
