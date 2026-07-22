import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Chip } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { createClient } from '@/lib/supabase/server';
import Footer from '@/components/Footer';
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, LockIcon } from '@/components/icons';
import { canAccessCourse } from '@/lib/coins/lessonUnlock';
import { getCourses, getCourseTopics } from '@/lib/quiz/lessons';

export const metadata: Metadata = {
  title: 'Kurs',
};

// Course page: the ordered topic list of ONE course.
//
// Server component, no client JS: every topic row is either a Link or an inert
// div. Nothing here is interactive, so nothing here needs to hydrate.
//
// params is a Promise in Next.js 16 (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md).
export default async function CoursePage({ params }: { params: Promise<{ courseId: string }> }) {
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
      <div className="flex flex-1 flex-col">
        <section className="px-6 py-16 lg:py-20">
          <div className="glass-panel mx-auto max-w-lg rounded-2xl px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-safety-yellow/15 text-safety-yellow">
              <LockIcon width={20} height={20} />
            </div>
            <h1 className="text-headline-md">Bu kurs sizə açıq deyil</h1>
            <p className="mx-auto mt-2 max-w-sm text-body-md text-on-surface-variant">
              Kursu açmaq üçün kurslar səhifəsinə qayıdın.
            </p>
            <Link
              href="/oyrenme"
              className={buttonVariants({ variant: 'primary', size: 'sm' }) + ' mt-5'}
            >
              Kurslara qayıt
            </Link>
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  // getCourses() rather than a fresh lesson_courses query: it is the existing
  // read for the same rows (title/description) and keeps every course read on
  // this feature going through lib/quiz/lessons.
  const [topics, courses] = await Promise.all([
    getCourseTopics(courseId, user.id),
    getCourses(user.id),
  ]);
  const course = courses.find((c) => c.id === courseId);
  const passedCount = topics.filter((t) => t.passed).length;
  const progressPct = topics.length > 0 ? Math.round((passedCount / topics.length) * 100) : 0;

  return (
    <div id="top" className="flex flex-1 flex-col">
      <section className="relative overflow-hidden px-6 pt-10 pb-6">
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="relative z-10 mx-auto flex max-w-3xl flex-col gap-4">
          <Link
            href="/oyrenme"
            className="inline-flex w-fit items-center gap-1.5 text-label-sm text-on-surface-variant transition-colors hover:text-primary"
          >
            <ArrowLeftIcon width={16} height={16} />
            Kurslar
          </Link>

          <h1 className="text-display-lg text-[32px] text-balance lg:text-[40px]">
            {course?.title ?? 'Kurs'}
          </h1>
          <p className="max-w-xl text-body-md text-on-surface-variant">
            {course?.description ??
              'Mövzuları ardıcıllıqla oxuyun və hər mövzunun sonundakı testi keçin. Növbəti mövzu ancaq əvvəlkini keçdikdən sonra açılır.'}
          </p>

          {topics.length > 0 && (
            <div className="glass-panel w-full max-w-md rounded-2xl p-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-label-sm text-on-surface-variant">Kurs irəliləyişi</span>
                <span className="text-label-sm text-go-green">
                  {passedCount}/{topics.length} mövzu
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-tertiary">
                <div
                  className="h-full rounded-full bg-go-green shadow-[0_0_10px_rgba(34,197,94,0.4)] transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="px-6 pb-12">
        <div className="mx-auto max-w-3xl">
          {topics.length === 0 ? (
            <div className="glass-panel rounded-2xl px-6 py-12 text-center">
              <h2 className="text-headline-md">Mövzular hazırlanır</h2>
              <p className="mx-auto mt-2 max-w-md text-body-md text-on-surface-variant">
                Bu kursda hələ dərc edilmiş mövzu yoxdur. Tezliklə burada görünəcək.
              </p>
            </div>
          ) : (
            <ol className="flex flex-col gap-3">
              {topics.map((topic, i) => {
                const rowClass =
                  'glass-card flex items-center gap-4 rounded-2xl border border-transparent p-5';

                const badge = topic.passed ? (
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-go-green/15 text-go-green">
                    <CheckIcon width={18} height={18} />
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
                          className={`text-headline-md text-[17px] ${topic.isUnlocked ? '' : 'text-on-surface-variant'}`}
                        >
                          {topic.title}
                        </h3>
                        {topic.passed && (
                          <Chip
                            size="sm"
                            variant="soft"
                            color="success"
                            className="mono-label shrink-0"
                          >
                            Keçilib
                          </Chip>
                        )}
                        {!topic.isUnlocked && (
                          <Chip
                            size="sm"
                            variant="soft"
                            color="default"
                            className="mono-label shrink-0"
                          >
                            Kilidli
                          </Chip>
                        )}
                      </div>

                      <p className="mt-1 text-label-sm text-on-surface-variant">
                        {topic.passed
                          ? `Ən yaxşı nəticə: ${topic.bestScore} • ${topic.attempts} cəhd`
                          : !topic.isUnlocked
                            ? 'Açmaq üçün əvvəlki mövzunun testini keçin'
                            : topic.attempts > 0
                              ? `${topic.attempts} cəhd • ən yaxşı nəticə: ${topic.bestScore}`
                              : 'Oxu və testi keç'}
                      </p>
                    </div>

                    {topic.isUnlocked && (
                      <ArrowRightIcon
                        width={18}
                        height={18}
                        className="shrink-0 text-on-surface-variant"
                      />
                    )}
                  </>
                );

                return (
                  <li key={topic.id}>
                    {topic.isUnlocked ? (
                      <Link
                        href={`/oyrenme/${courseId}/${topic.id}`}
                        className={`${rowClass} transition-[transform,border-color] hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
                      >
                        {body}
                      </Link>
                    ) : (
                      // Locked topics are NOT links: the topic page would refuse
                      // them anyway (resolveAccessibleTopic), so a link here
                      // would only navigate to a not-found state.
                      <div className={`${rowClass} opacity-60`}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
