import Link from 'next/link';
import type { ReactNode } from 'react';
import RoadShaderBackground from '@/components/design3d/RoadShaderBackground';
import { ArrowLeftIcon, LockIcon } from '@/components/icons';

interface CoursePage3DLockedProps {
  locked: true;
}

interface CourseTopicRow {
  id: string;
  title: string;
  passed: boolean;
  /** The sequential rule: the previous topic's test has been passed. */
  isUnlocked: boolean;
  /** The paywall (0100): beyond the course's free preview window. */
  requiresUnlock: boolean;
  attempts: number;
  bestScore: number;
  href: string;
}

interface CoursePage3DUnlockedProps {
  locked?: false;
  title: string;
  description: string;
  passedCount: number;
  totalCount: number;
  progressPct: number;
  topics: CourseTopicRow[];
  /** Rendered when `topics` is empty — reuses the exact same glass-panel empty state markup. */
  emptyState?: ReactNode;
}

type CoursePage3DProps = CoursePage3DLockedProps | CoursePage3DUnlockedProps;

function Backdrop() {
  return (
    <>
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--hud-bg-deep)' }} aria-hidden="true">
        <RoadShaderBackground className="absolute inset-0 h-full w-full" />
      </div>
      <div
        className="fixed inset-0 -z-10"
        style={{ background: 'color-mix(in oklab, var(--hud-bg-deep) 50%, transparent)' }}
        aria-hidden="true"
      />
    </>
  );
}

export default function CoursePage3D(props: CoursePage3DProps) {
  if (props.locked) {
    // Locked/nonexistent — deliberately indistinguishable, same as the simple
    // tree's early-return branch. No title, no topic count, nothing course-
    // specific leaves the server on this path.
    return (
      <div
        className="relative flex flex-1 flex-col"
        style={{ color: 'var(--hud-on-surface)', fontFamily: 'var(--hud-font-body)' }}
      >
        <Backdrop />
        <section className="relative z-10 px-6 py-16 lg:py-20">
          <div
            className="hud-glass mx-auto max-w-lg rounded-2xl border-l-4 px-6 py-12 text-center"
            style={{ borderColor: 'var(--hud-primary)' }}
          >
            <div
              className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl"
              style={{ background: 'color-mix(in oklab, var(--hud-primary) 15%, transparent)', color: 'var(--hud-primary)' }}
            >
              <LockIcon width={20} height={20} />
            </div>
            <h1 className="text-lg font-bold" style={{ fontFamily: 'var(--hud-font-display)' }}>
              Bu kurs sizə açıq deyil
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm" style={{ color: 'var(--hud-on-surface-variant)' }}>
              Kursu açmaq üçün kurslar səhifəsinə qayıdın.
            </p>
            <Link
              href="/oyrenme"
              className="mt-5 inline-flex items-center rounded-xl px-6 py-3 text-sm font-bold transition-transform hover:scale-105 active:scale-95"
              style={{ background: 'var(--hud-primary)', color: 'var(--hud-on-primary)', boxShadow: '0 0 20px var(--hud-glow-primary)' }}
            >
              Kurslara qayıt
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const { title, description, passedCount, totalCount, progressPct, topics, emptyState } = props;

  return (
    <div
      className="relative flex flex-1 flex-col"
      style={{ color: 'var(--hud-on-surface)', fontFamily: 'var(--hud-font-body)' }}
    >
      <Backdrop />

      <section className="relative z-10 px-6 pt-10 pb-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <Link
            href="/oyrenme"
            className="inline-flex w-fit items-center gap-1.5 text-sm transition-colors"
            style={{ color: 'var(--hud-on-surface-variant)' }}
          >
            <ArrowLeftIcon width={16} height={16} />
            Kurslar
          </Link>

          <h1 className="text-2xl font-bold md:text-3xl text-balance" style={{ fontFamily: 'var(--hud-font-display)' }}>
            {title}
          </h1>
          <p className="max-w-xl text-sm" style={{ color: 'var(--hud-on-surface-variant)' }}>
            {description}
          </p>

          {totalCount > 0 && (
            <div
              className="hud-glass w-full max-w-md rounded-2xl border-l-4 p-5"
              style={{ borderColor: 'var(--hud-primary)' }}
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className="text-[11px] font-bold uppercase tracking-widest"
                  style={{ fontFamily: 'var(--hud-font-mono)', color: 'var(--hud-on-surface-variant)' }}
                >
                  Kurs irəliləyişi
                </span>
                <span className="text-xs font-bold" style={{ color: 'var(--hud-green)' }}>
                  {passedCount}/{totalCount} mövzu
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full"
                style={{ background: 'color-mix(in oklab, var(--hud-on-surface) 10%, transparent)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${progressPct}%`,
                    background: 'var(--hud-green)',
                    boxShadow: '0 0 10px color-mix(in oklab, var(--hud-green) 60%, transparent)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="relative z-10 px-6 pb-12">
        <div className="mx-auto max-w-7xl">
          {topics.length === 0
            ? emptyState
            : (
              <ol className="flex flex-col gap-3">
                {topics.map((topic, i) => {
                  // A topic opens only when BOTH gates are clear — passing the
                  // previous test and being inside the free window or paid for.
                  const isOpen = topic.isUnlocked && !topic.requiresUnlock;
                  const badge = topic.passed ? (
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl font-bold"
                      style={{ background: 'color-mix(in oklab, var(--hud-green) 15%, transparent)', color: 'var(--hud-green)' }}
                    >
                      ✓
                    </span>
                  ) : isOpen ? (
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                      style={{ background: 'color-mix(in oklab, var(--hud-primary) 15%, transparent)', color: 'var(--hud-primary)', fontFamily: 'var(--hud-font-mono)' }}
                    >
                      {i + 1}
                    </span>
                  ) : (
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: 'color-mix(in oklab, var(--hud-on-surface) 8%, transparent)', color: 'var(--hud-on-surface-variant)' }}
                    >
                      <LockIcon width={16} height={16} />
                    </span>
                  );

                  const body = (
                    <>
                      {badge}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3
                            className="text-[17px] font-bold"
                            style={{ color: isOpen ? 'var(--hud-on-surface)' : 'var(--hud-on-surface-variant)' }}
                          >
                            {topic.title}
                          </h3>
                          {topic.passed && (
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                              style={{ fontFamily: 'var(--hud-font-mono)', color: 'var(--hud-green)', background: 'color-mix(in oklab, var(--hud-green) 15%, transparent)' }}
                            >
                              Keçilib
                            </span>
                          )}
                          {!isOpen && (
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest"
                              style={{ fontFamily: 'var(--hud-font-mono)', color: 'var(--hud-on-surface-variant)', background: 'color-mix(in oklab, var(--hud-on-surface) 8%, transparent)' }}
                            >
                              Kilidli
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm" style={{ color: 'var(--hud-on-surface-variant)' }}>
                          {topic.passed
                            ? `Ən yaxşı nəticə: ${topic.bestScore} • ${topic.attempts} cəhd`
                            : topic.requiresUnlock
                              ? 'Bu mövzu pulsuz hissədən kənardadır — kursu açın'
                              : !isOpen
                                ? 'Açmaq üçün əvvəlki mövzunun testini keçin'
                              : topic.attempts > 0
                                ? `${topic.attempts} cəhd • ən yaxşı nəticə: ${topic.bestScore}`
                                : 'Oxu və testi keç'}
                        </p>
                      </div>
                      {isOpen && (
                        <span style={{ color: 'var(--hud-on-surface-variant)' }}>→</span>
                      )}
                    </>
                  );

                  const rowClass =
                    'hud-glass flex items-center gap-4 rounded-2xl border-l-4 p-5';
                  const rowStyle = { borderColor: topic.passed ? 'var(--hud-green)' : isOpen ? 'var(--hud-primary)' : 'var(--hud-border)' };

                  return (
                    <li key={topic.id}>
                      {isOpen ? (
                        <Link
                          href={topic.href}
                          className={`${rowClass} transition-transform hover:-translate-y-0.5`}
                          style={rowStyle}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className={`${rowClass} opacity-60`} style={rowStyle}>
                          {body}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
        </div>
      </section>
    </div>
  );
}
