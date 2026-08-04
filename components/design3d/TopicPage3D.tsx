import Link from 'next/link';
import type { ReactNode } from 'react';
import RoadShaderBackground from '@/components/design3d/RoadShaderBackground';
import { ArrowLeftIcon, ArrowRightIcon } from '@/components/icons';
import HideDuringTest from '@/components/oyrenme/TopicTestFocus';

interface TopicPage3DProps {
  courseId: string;
  courseTitle: string;
  title: string;
  orderIndex: number;
  passed: boolean;
  bestScore: number;
  /** LessonMarkdown + source citations, rendered unchanged inside the HUD article frame. */
  article: ReactNode;
  /** TopicTest (client component, own state/server actions), wrapped unchanged. */
  testSection: ReactNode;
  prevTopicId: string | null;
  nextTopicId: string | null;
}

// Same pattern as CoursePage3D/CoinQazanPage3D: article content and the test
// flow are already-rendered ReactNode props (LessonMarkdown output, TopicTest)
// — this component supplies only the surrounding HUD chrome, never re-derives
// the gated `topic` data or reimplements the test's client state.
export default function TopicPage3D({
  courseId,
  courseTitle,
  title,
  orderIndex,
  passed,
  bestScore,
  article,
  testSection,
  prevTopicId,
  nextTopicId,
}: TopicPage3DProps) {
  return (
    <div
      className="relative flex flex-1 flex-col"
      style={{ color: 'var(--hud-on-surface)', fontFamily: 'var(--hud-font-body)' }}
    >
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--hud-bg-deep)' }} aria-hidden="true">
        <RoadShaderBackground className="absolute inset-0 h-full w-full" />
      </div>
      <div
        className="fixed inset-0 -z-10"
        style={{ background: 'color-mix(in oklab, var(--hud-bg-deep) 50%, transparent)' }}
        aria-hidden="true"
      />

      <section className="relative z-10 px-6 pt-10 pb-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <nav className="flex flex-wrap items-center gap-1.5 text-sm" style={{ color: 'var(--hud-on-surface-variant)' }}>
            <Link href="/oyrenme" className="transition-colors" style={{ color: 'inherit' }}>
              Kurslar
            </Link>
            <span aria-hidden>/</span>
            <Link
              href={`/oyrenme/${courseId}`}
              className="inline-flex items-center gap-1.5 transition-colors"
              style={{ color: 'inherit' }}
            >
              <ArrowLeftIcon width={14} height={14} />
              {courseTitle || 'Kurs'}
            </Link>
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest"
              style={{ fontFamily: 'var(--hud-font-mono)', color: 'var(--hud-primary)', background: 'color-mix(in oklab, var(--hud-primary) 15%, transparent)' }}
            >
              Mövzu {orderIndex + 1}
            </span>
            {passed && (
              <span
                className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest"
                style={{ fontFamily: 'var(--hud-font-mono)', color: 'var(--hud-green)', background: 'color-mix(in oklab, var(--hud-green) 15%, transparent)' }}
              >
                Keçilib • ən yaxşı {bestScore}
              </span>
            )}
          </div>

          <h1 className="text-2xl font-bold md:text-3xl text-balance" style={{ fontFamily: 'var(--hud-font-display)' }}>
            {title}
          </h1>
        </div>
      </section>

      <section className="relative z-10 px-6 pb-10">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          {/* Unmounted while an attempt is running — the test must be answered
              from memory, not by scrolling back into the source text. */}
          <HideDuringTest>
            <article
              className="hud-glass rounded-2xl border-l-4 p-6 lg:p-8"
              style={{ borderColor: 'var(--hud-primary)' }}
            >
              {article}
            </article>
          </HideDuringTest>

          <div
            className="hud-glass rounded-2xl border-l-4 p-1 sm:p-1.5"
            style={{ borderColor: 'var(--hud-cyan)' }}
          >
            <div className="flex items-center gap-2 px-4 pt-3" style={{ fontFamily: 'var(--hud-font-mono)' }}>
              <span className="size-1.5 rounded-full" style={{ background: 'var(--hud-cyan)' }} />
              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--hud-cyan)' }}>
                TEST
              </span>
            </div>
            <div className="px-1 pb-1 sm:px-1.5 sm:pb-1.5">{testSection}</div>
          </div>

          <HideDuringTest>
            <nav className="flex flex-wrap items-center justify-between gap-3">
              {prevTopicId ? (
                <Link
                  href={`/oyrenme/${courseId}/${prevTopicId}`}
                  className="hud-glass inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition-colors"
                  style={{ color: 'var(--hud-on-surface-variant)' }}
                >
                  <ArrowLeftIcon width={16} height={16} />
                  Əvvəlki mövzu
                </Link>
              ) : (
                <span />
              )}

              {nextTopicId && passed ? (
                <Link
                  href={`/oyrenme/${courseId}/${nextTopicId}`}
                  className="hud-glass inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition-colors"
                  style={{ color: 'var(--hud-on-surface-variant)' }}
                >
                  Növbəti mövzu
                  <ArrowRightIcon width={16} height={16} />
                </Link>
              ) : (
                <span />
              )}
            </nav>
          </HideDuringTest>
        </div>
      </section>
    </div>
  );
}
