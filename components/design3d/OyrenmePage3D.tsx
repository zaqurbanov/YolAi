import Link from 'next/link';
import type { ReactNode } from 'react';
import RoadShaderBackground from '@/components/design3d/RoadShaderBackground';
import { ArrowRightIcon, HelpIcon } from '@/components/icons';

interface OyrenmePage3DProps {
  totalTopics: number;
  passedTopics: number;
  overallPct: number;
  hasCourses: boolean;
  /** Already-rendered CourseGrid (server component, real courses/actions untouched) or the empty-state card. */
  courseSection: ReactNode;
}

// Same pattern as HomePage3D/CoinQazanPage3D: app/oyrenme/page.tsx fetches
// real course/balance data and passes it down (courseSection is CourseGrid,
// mounted UNCHANGED — its internal cards/UnlockCourseCard purchase dialog
// keep using the existing "sadə dizayn" tokens, exactly like GarageCard etc.
// do inside CoinQazanPage3D's HudFrame wrappers). This component only
// supplies the surrounding "Cyber-Circuit Legal" HUD chrome.
const FOOTER_LINKS = [
  { href: '/faq/faq', label: 'Suallar' },
  { href: '/faq/privacy', label: 'Məxfilik Siyasəti' },
  { href: '/faq/terms', label: 'İstifadə Şərtləri' },
  { href: '/faq/istifade-qaydalari', label: 'İstifadə Qaydaları' },
];

export default function OyrenmePage3D({
  totalTopics,
  passedTopics,
  overallPct,
  hasCourses,
  courseSection,
}: OyrenmePage3DProps) {
  return (
    <div
      className="relative flex flex-1 flex-col"
      style={{ color: 'var(--hud-on-surface)', fontFamily: 'var(--hud-font-body)' }}
    >
      {/* Fixed shader backdrop + legibility veil — same treatment as HomePage3D/CoinQazanPage3D. */}
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--hud-bg-deep)' }} aria-hidden="true">
        <RoadShaderBackground className="absolute inset-0 h-full w-full" />
      </div>
      <div
        className="fixed inset-0 -z-10"
        style={{ background: 'color-mix(in oklab, var(--hud-bg-deep) 50%, transparent)' }}
        aria-hidden="true"
      />

      {/* ---------- Hero ---------- */}
      <section className="relative px-6 py-16 lg:py-20">
        <div className="relative z-10 mx-auto flex max-w-7xl flex-col items-center gap-4 text-center">
          <span
            className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-widest"
            style={{
              borderColor: 'color-mix(in oklab, var(--hud-primary) 30%, transparent)',
              background: 'color-mix(in oklab, var(--hud-primary) 10%, transparent)',
              color: 'var(--hud-primary)',
            }}
          >
            <span className="size-2 rounded-full" style={{ background: 'var(--hud-green)' }} />
            Sürücülük vəsiqəsi
          </span>
          <h1
            className="text-4xl font-extrabold leading-tight lg:text-5xl text-balance"
            style={{ fontFamily: 'var(--hud-font-display)' }}
          >
            Sürücülük Vəsiqəsini Al
          </h1>
          <p className="max-w-2xl text-base" style={{ color: 'var(--hud-on-surface-variant)' }}>
            Vəsiqə almaq üçün ilk növbədə yol hərəkəti qaydalarını bilmək lazımdır. Bu qaydaları
            öyrənmək üçün isə aşağıdakı kurslara qatıla bilərsiniz.
          </p>

          {totalTopics > 0 && (
            <div
              className="hud-glass mt-2 w-full max-w-md rounded-2xl border-l-4 p-5"
              style={{ borderColor: 'var(--hud-primary)' }}
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className="text-[11px] font-bold uppercase tracking-widest"
                  style={{ fontFamily: 'var(--hud-font-mono)', color: 'var(--hud-on-surface-variant)' }}
                >
                  Ümumi irəliləyiş
                </span>
                <span className="text-xs font-bold" style={{ color: 'var(--hud-green)' }}>
                  {passedTopics}/{totalTopics} mövzu
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full"
                style={{ background: 'color-mix(in oklab, var(--hud-on-surface) 10%, transparent)' }}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${overallPct}%`,
                    background: 'var(--hud-green)',
                    boxShadow: '0 0 10px color-mix(in oklab, var(--hud-green) 60%, transparent)',
                  }}
                />
              </div>
            </div>
          )}

          <Link
            href="/chat"
            className="hud-glass mt-2 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold transition-transform hover:scale-105 active:scale-95"
            style={{ color: 'var(--hud-cyan)' }}
          >
            Sualınız var? AI köməkçidən soruşun
            <ArrowRightIcon width={16} height={16} />
          </Link>
        </div>
      </section>

      {/* ---------- Course grid ---------- */}
      <section className="relative px-6 py-8 lg:py-12">
        <div className="relative z-10 mx-auto max-w-7xl">
          {hasCourses && (
            <div className="mb-6 flex items-center gap-2" style={{ fontFamily: 'var(--hud-font-mono)' }}>
              <span className="size-1.5 rounded-full" style={{ background: 'var(--hud-primary)' }} />
              <span
                className="text-[11px] font-bold uppercase tracking-widest"
                style={{ color: 'var(--hud-primary)' }}
              >
                KURSLAR
              </span>
            </div>
          )}
          {/* courseSection (CourseGrid) is mounted unchanged and still carries
              its own "sadə dizayn" `glass-card` classes — `oyrenme-hud-courses`
              scopes a HUD repaint onto those existing classes (same technique
              as `.chat-hud-shell .glass-panel` for the chat re-skin) instead of
              forking CourseGrid into a second JSX tree. See app/globals.css. */}
          <div className="oyrenme-hud-courses">{courseSection}</div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t px-6 py-8" style={{ borderColor: 'var(--hud-border)' }}>
        <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 text-center sm:flex-row sm:justify-between sm:text-left">
          <div className="flex flex-col items-center gap-1 sm:items-start">
            <span className="text-base font-bold" style={{ fontFamily: 'var(--hud-font-display)' }}>
              Yol Hərəkəti QA
            </span>
            <span className="text-xs" style={{ fontFamily: 'var(--hud-font-mono)', color: 'var(--hud-on-surface-variant)' }}>
              &copy; {new Date().getFullYear()} Hüquqi AI köməkçi. Bütün hüquqlar qorunur.
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 sm:flex-nowrap">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="whitespace-nowrap text-sm hover:underline"
                style={{ color: 'var(--hud-on-surface-variant)' }}
              >
                {link.label}
              </Link>
            ))}
            <a
              href="mailto:qurbanovzaur078@gmail.com"
              aria-label="Dəstək"
              className="hud-glass flex size-10 items-center justify-center rounded-full"
              style={{ color: 'var(--hud-on-surface-variant)' }}
            >
              <HelpIcon />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
