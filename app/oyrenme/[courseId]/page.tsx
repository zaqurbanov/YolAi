import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { buttonVariants } from '@heroui/styles';
import { createClient } from '@/lib/supabase/server';
import Footer from '@/components/Footer';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  AwardIcon,
  CheckIcon,
  LockIcon,
  PlayIcon,
} from '@/components/icons';
import { canAccessCourse } from '@/lib/coins/lessonUnlock';
import { getCourses, getCourseTopics } from '@/lib/quiz/lessons';
import DesignSwitch from '@/components/design3d/DesignSwitch';
import CoursePage3D from '@/components/design3d/CoursePage3D';
import { getServerDesign } from '@/lib/design/getServerDesign';
import MobileCoursePage from '@/components/oyrenme/MobileCoursePage';

export const metadata: Metadata = {
  title: 'Kurs',
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-primary">{children}</span>
  );
}

// Course page: the ordered topic list of ONE course.
//
// Server component, no client JS: every topic row is either a Link or an inert
// div. Nothing here is interactive, so nothing here needs to hydrate.
//
// params is a Promise in Next.js 16 (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md).
export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const design = await getServerDesign();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { courseId } = await params;

  // THE gate, and it runs before any topic read. proxy.ts only guards the
  // /oyrenme prefix optimistically from a cookie — it is not authorization,
  // and it knows nothing about which courses this user has unlocked.
  const allowed = await canAccessCourse(user.id, courseId);
  if (!allowed) {
    // Locked or nonexistent, deliberately indistinguishable: no title, no topic
    // count, nothing about the course leaves the server. The grid on /oyrenme
    // is where a locked course is actually purchasable.
    return (
      <DesignSwitch
        design={design}
        simple={
          <div className="editorial flex flex-1 flex-col pb-24 md:pb-0">
            <div className="mx-auto w-full max-w-[1280px] px-6 pt-10 md:px-16 md:pt-16">
              <div className="mx-auto max-w-lg rounded-3xl border border-border/40 bg-surface p-6 text-center shadow-sm md:p-10">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-surface-tertiary text-on-surface-variant">
                  <LockIcon width={20} height={20} aria-hidden />
                </div>
                <h1 className="text-[28px] font-semibold leading-tight text-navy md:text-[40px]">
                  Bu kurs sizə açıq deyil
                </h1>
                <p className="mx-auto mt-2 max-w-sm text-[16px] leading-relaxed text-on-surface-variant">
                  Kursu açmaq üçün kurslar səhifəsinə qayıdın.
                </p>
                <Link
                  href="/oyrenme"
                  className={buttonVariants({ variant: 'primary', size: 'lg' }) + ' glow-primary mt-6 rounded-full'}
                >
                  Kurslara qayıt
                </Link>
              </div>
            </div>
            <div className="mt-16">
              <Footer />
            </div>
          </div>
        }
        threeD={<CoursePage3D locked />}
      />
    );
  }

  // getCourses() rather than a fresh lesson_courses query: it is the existing
  // read for the same rows (title/description) and keeps every course read on
  // this feature going through lib/quiz/lessons.
  // Coin balance is no longer read here: the mobile course header that showed
  // it was removed in favour of the global NavBar's CoinBadge, which fetches
  // its own balance client-side. One fewer per-request DB round trip.
  const [topics, courses] = await Promise.all([
    getCourseTopics(courseId, user.id),
    getCourses(user.id),
  ]);
  const course = courses.find((c) => c.id === courseId);
  const passedCount = topics.filter((t) => t.passed).length;
  const progressPct = topics.length > 0 ? Math.round((passedCount / topics.length) * 100) : 0;
  // "Sizin üçün seçilənlər" mobile rail — same getCourses() read as above,
  // just the current course excluded, not a second content source.
  const otherCourses = courses.filter((c) => c.id !== courseId);

  // Same topic rows, restyled — built once and handed to the 3D tree as plain
  // data (CoursePage3D owns the HUD markup, no JSX duplicated as a prop).
  const topicRows = topics.map((topic) => ({
    id: topic.id,
    title: topic.title,
    passed: topic.passed,
    isUnlocked: topic.isUnlocked,
    attempts: topic.attempts,
    bestScore: topic.bestScore,
    href: `/oyrenme/${courseId}/${topic.id}`,
  }));
  const emptyStateHud = (
    <div className="hud-glass rounded-2xl px-6 py-12 text-center">
      <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--hud-font-display)' }}>
        Mövzular hazırlanır
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: 'var(--hud-on-surface-variant)' }}>
        Bu kursda hələ dərc edilmiş mövzu yoxdur. Tezliklə burada görünəcək.
      </p>
    </div>
  );

  return (
    <DesignSwitch
      design={design}
      simple={
        <>
          {/* Mobile course-detail shell (see legaldrive-design skill,
              "Academy (Öyrənmə) page — mobile") — CSS-only split via
              md:hidden. Desktop tree below is the editorial restyle. */}
          <div className="md:hidden">
            <MobileCoursePage
              courseId={courseId}
              title={course?.title ?? 'Kurs'}
              description={
                course?.description ??
                'Mövzuları ardıcıllıqla oxuyun və hər mövzunun sonundakı testi keçin. Növbəti mövzu ancaq əvvəlkini keçdikdən sonra açılır.'
              }
              topics={topics}
              passedCount={passedCount}
              progressPct={progressPct}
              otherCourses={otherCourses}
            />
          </div>

          <div className="hidden md:contents">
        <div id="top" className="editorial flex flex-1 flex-col pb-24 md:pb-0">
          <div className="mx-auto w-full max-w-[1280px] space-y-16 px-6 pt-10 md:space-y-28 md:px-16 md:pt-16">
            <section className="grid grid-cols-1 items-center gap-8 md:grid-cols-12">
              <div className="space-y-6 md:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <Eyebrow>Kurs</Eyebrow>
                  <Link
                    href="/oyrenme"
                    className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-primary transition-[gap] hover:gap-2.5"
                  >
                    <ArrowLeftIcon width={13} height={13} aria-hidden />
                    Kurslar
                  </Link>
                </div>

                <h1 className="text-[32px] font-semibold leading-[1.15] text-navy md:text-[40px]">
                  {course?.title ?? 'Kurs'}
                </h1>
                <p className="max-w-xl text-[18px] leading-relaxed text-on-surface-variant">
                  {course?.description ??
                    'Mövzuları ardıcıllıqla oxuyun və hər mövzunun sonundakı testi keçin. Növbəti mövzu ancaq əvvəlkini keçdikdən sonra açılır.'}
                </p>

                {topics.length > 0 && (
                  <div className="space-y-4 rounded-3xl border border-border/40 bg-surface p-6 shadow-sm">
                    <div className="flex items-end justify-between gap-4">
                      <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-navy">
                        Kurs irəliləyişi
                      </span>
                      <span className="editorial-display text-[56px] font-bold leading-none text-primary tabular-nums md:text-[64px]">
                        {progressPct}%
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuenow={progressPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Kurs irəliləyişi"
                      className="h-3 w-full overflow-hidden rounded-full bg-surface-tertiary"
                    >
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(progressPct, 2)}%` }}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] bg-surface-tertiary text-navy tabular-nums">
                        {passedCount}/{topics.length} mövzu
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Same static seal as the home hero. Desktop only — on a phone
                  the hero needs the full width for type, not decoration. */}
              <div className="hidden justify-center md:col-span-5 md:flex">
                <div className="editorial-seal flex size-40 items-center justify-center rounded-full shadow-lg">
                  <AwardIcon width={64} height={64} aria-hidden />
                </div>
              </div>
            </section>

            <section>
              <Eyebrow>Dərs proqramı</Eyebrow>
              {topics.length === 0 ? (
                <div className="mt-8 rounded-3xl border border-border/40 bg-surface p-6 shadow-sm md:p-12">
                  <div className="mx-auto max-w-md text-center">
                    <h2 className="text-[20px] font-semibold text-navy md:text-[22px]">
                      Mövzular hazırlanır
                    </h2>
                    <p className="mt-2 text-[14px] leading-relaxed text-on-surface-variant">
                      Bu kursda hələ dərc edilmiş mövzu yoxdur. Tezliklə burada görünəcək.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <h2 className="mt-2 text-[28px] font-semibold leading-tight text-navy md:text-[40px]">
                    Mövzuları ardıcıllıqla keç.
                  </h2>
                  {/* [&>li]:min-w-0 — same grid-item min-width:auto trap as the
                      mobile list: without it a row wider than its 1fr track
                      (icon + CTA + text) overflows at tablet widths. */}
                  <ul className="mt-8 grid gap-3 md:grid-cols-2 [&>li]:min-w-0">
                    {topics.map((topic, i) => {
                      const num = String(i + 1).padStart(2, '0');
                      const href = `/oyrenme/${courseId}/${topic.id}`;

                      if (topic.passed) {
                        return (
                          <li key={topic.id}>
                            <Link
                              href={href}
                              className="group flex items-center gap-4 rounded-2xl border border-border/40 bg-surface p-4 transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0"
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

                      if (!topic.passed && topic.isUnlocked) {
                        return (
                          <li key={topic.id}>
                            <Link
                              href={href}
                              className="group flex items-center gap-4 rounded-2xl border border-primary/40 bg-surface p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0"
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
                              {/* Visual CTA only — the whole row is the link, so
                                  this must not be a second focusable element. */}
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
                                {num} · Bağlı
                              </p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </section>
          </div>

          <div className="mt-16">
            <Footer />
          </div>
        </div>
          </div>
        </>
      }
      threeD={
        <CoursePage3D
          title={course?.title ?? 'Kurs'}
          description={
            course?.description ??
            'Mövzuları ardıcıllıqla oxuyun və hər mövzunun sonundakı testi keçin. Növbəti mövzu ancaq əvvəlkini keçdikdən sonra açılır.'
          }
          passedCount={passedCount}
          totalCount={topics.length}
          progressPct={progressPct}
          topics={topicRows}
          emptyState={emptyStateHud}
        />
      }
    />
  );
}
