import Link from 'next/link';
import { buttonVariants } from '@heroui/styles';
import { Chip } from '@heroui/react';
import MobileBottomTabBar from '@/components/home/MobileBottomTabBar';
import { ACCENT_STYLES } from '@/components/CategoryCard';
import { CoinIcon, LockIcon, RulesIcon, ArrowRightIcon } from '@/components/icons';
import { formatCoinBalance } from '@/lib/format/coins';
import type { CourseSummary } from '@/lib/quiz/lessons';
import UnlockCourseCard from '@/app/oyrenme/UnlockCourseCard';

export interface MobileOyrenmeProps {
  courses: CourseSummary[];
  /** Display only. null when the balance read failed — it fails open. */
  balance: number | null;
  overallPct: number;
  totalTopics: number;
  passedTopics: number;
}

// Mobile-only Academy (course list) shell — see legaldrive-design skill's
// "Academy (Öyrənmə) page — mobile" section. Rendered only inside the
// md:hidden wrapper in app/oyrenme/page.tsx; the desktop/3D tree is
// untouched. Reuses CourseGrid's underlying data/actions (UnlockCourseCard),
// just restyled as a stacked mobile list instead of a grid.
export default function MobileOyrenme({
  courses,
  balance,
  overallPct,
  totalTopics,
  passedTopics,
}: MobileOyrenmeProps) {
  const hasCourses = courses.length > 0;

  return (
    <div className="flex flex-col pb-24">
      <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between border-b border-outline-variant/30 bg-surface/60 px-4 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <div className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/30">
            <RulesIcon width={18} height={18} />
          </div>
          <span className="text-headline-md text-[16px]">Akademiya</span>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-safety-yellow/15 px-3 py-1.5 text-label-sm font-semibold text-safety-yellow">
          <CoinIcon width={16} height={16} />
          {balance != null ? formatCoinBalance(balance) : '—'}
        </span>
      </header>

      <div className="px-4 pt-5">
        <h1 className="text-display-lg text-[28px] text-on-surface">Sürücülük Vəsiqəsini Al</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Kursları ardıcıllıqla keçin, testləri həll edin və vəsiqə imtahanına hazırlaşın.
        </p>
      </div>

      {totalTopics > 0 && (
        <div className="px-4 pt-4">
          <div className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <p className="text-label-sm text-on-surface-variant">Ümumi irəliləyiş</p>
              <span className="text-label-sm text-go-green">
                {passedTopics}/{totalTopics} mövzu
              </span>
            </div>
            <p className="mt-1 text-3xl font-extrabold text-primary">{overallPct}%</p>
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
              <div
                className="h-full rounded-full bg-go-green shadow-[0_0_10px_rgba(34,197,94,0.4)] transition-all duration-500"
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className="px-4 pt-6">
        <h2 className="mb-3 text-headline-md text-[18px]">Kurslar</h2>

        {!hasCourses ? (
          <div className="glass-card rounded-2xl px-6 py-10 text-center">
            <h3 className="text-headline-md text-[17px]">Kurslar hazırlanır</h3>
            <p className="mx-auto mt-2 max-w-xs text-body-md text-on-surface-variant">
              Hələ dərc edilmiş kurs yoxdur. Yol hərəkəti qaydaları üzrə kurslar tezliklə burada
              görünəcək.
            </p>
            <Link href="/chat" className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' mt-5'}>
              AI köməkçiyə sual ver
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {courses.map((course, i) => {
              const accent = ACCENT_STYLES[i % ACCENT_STYLES.length];
              const isEmpty = course.totalTopics === 0;
              const isLocked = !isEmpty && !course.isUnlocked;
              const isOpen = !isEmpty && course.isUnlocked;
              const cardClass = `glass-card flex flex-col border border-transparent border-l-4 ${accent.border} p-4`;

              const content = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <h3
                      className={`text-headline-md text-[17px] ${isOpen ? '' : 'text-on-surface-variant'}`}
                    >
                      {course.title}
                    </h3>
                    {isLocked && (
                      <Chip size="sm" variant="soft" color="warning" className="mono-label shrink-0">
                        <LockIcon width={12} height={12} />
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
                    <p className="mt-1 line-clamp-2 text-label-sm text-on-surface-variant">
                      {course.description}
                    </p>
                  )}

                  {isOpen && (
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-legal-citation text-on-surface-variant">
                        <span>İrəliləyiş</span>
                        <span>
                          {course.passedTopics}/{course.totalTopics}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
                        <div
                          className="h-full rounded-full bg-go-green transition-all duration-500"
                          style={{ width: `${course.progressPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {isLocked && (
                    <p className="mt-3 text-legal-citation text-on-surface-variant">
                      {course.totalTopics} mövzu · birdəfəlik ödənişlə açılır
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-outline-variant/40 pt-2.5">
                    <span className={`text-legal-citation ${accent.citation}`}>
                      {course.isFree ? 'Pulsuz' : 'Kurs'}
                    </span>
                    {isLocked ? (
                      <span className="flex items-center gap-1 text-label-sm font-semibold text-safety-yellow">
                        <CoinIcon width={14} height={14} />
                        {course.price}
                      </span>
                    ) : isOpen ? (
                      <ArrowRightIcon width={16} height={16} className="text-on-surface-variant" />
                    ) : null}
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
                    className={`${cardClass} transition-[transform,border-color] active:scale-[0.98]`}
                  >
                    {content}
                  </Link>
                );
              }

              return (
                <div key={course.id} className={cardClass}>
                  {content}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <MobileBottomTabBar />
    </div>
  );
}
