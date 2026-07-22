import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@heroui/styles';
import { createClient } from '@/lib/supabase/server';
import Footer from '@/components/Footer';
import { getCourses } from '@/lib/quiz/lessons';
import { getCoinBalanceStatus } from '@/lib/chat/coins';
import CourseGrid from './CourseGrid';

export const metadata: Metadata = {
  title: 'Sürücülük vəsiqəsini al',
};

export default async function OyrenmePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // getCourses() returns [] (never throws) when the lessons migration has not
  // been applied yet — the empty state below is the live path today, not a
  // theoretical edge case.
  // Balance is display-only (the unlock action re-reads and charges its own).
  // getCoinBalanceStatus fails open; null just renders as "—" in the dialog.
  // Its `price` field is the CHAT MESSAGE price — not a course price. Ignored.
  const [courses, balance] = await Promise.all([
    getCourses(user.id),
    getCoinBalanceStatus(user.id)
      .then((s) => s.balance)
      .catch(() => null),
  ]);

  // Overall progress is counted in TOPICS across all published courses, which
  // is the unit a user actually advances through now.
  const totalTopics = courses.reduce((sum, c) => sum + c.totalTopics, 0);
  const passedTopics = courses.reduce((sum, c) => sum + c.passedTopics, 0);
  const overallPct = totalTopics > 0 ? Math.round((passedTopics / totalTopics) * 100) : 0;

  return (
    <div id="top" className="flex flex-1 flex-col">
      <section className="relative overflow-hidden px-6 py-16 lg:py-20">
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="relative z-10 mx-auto flex max-w-5xl flex-col items-center gap-4 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-primary/10 px-4 py-1.5 text-label-sm text-primary">
            <span className="size-2 rounded-full bg-go-green" />
            Sürücülük vəsiqəsi
          </span>
          <h1 className="text-display-lg text-balance">Sürücülük Vəsiqəsini Al</h1>
          <p className="max-w-2xl text-body-lg text-on-surface-variant">
            Vəsiqə almaq üçün ilk növbədə yol hərəkəti qaydalarını bilmək lazımdır. Bu qaydaları
            öyrənmək üçün isə aşağıdakı kurslara qatıla bilərsiniz.
          </p>

          {totalTopics > 0 && (
            <div className="glass-panel mt-2 w-full max-w-md rounded-2xl p-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-label-sm text-on-surface-variant">Ümumi irəliləyiş</span>
                <span className="text-label-sm text-go-green">
                  {passedTopics}/{totalTopics} mövzu
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-surface-tertiary">
                <div
                  className="h-full rounded-full bg-go-green shadow-[0_0_10px_rgba(34,197,94,0.4)] transition-all"
                  style={{ width: `${overallPct}%` }}
                />
              </div>
            </div>
          )}

          <Link
            href="/chat"
            className={
              buttonVariants({ variant: 'ghost', size: 'sm' }) +
              ' mt-2 transition-transform hover:scale-[1.03]'
            }
          >
            Sualınız var? AI köməkçidən soruşun
          </Link>
        </div>
      </section>

      <section className="px-6 py-8 lg:py-12">
        <div className="mx-auto max-w-5xl">
          {courses.length === 0 ? (
            <div className="glass-panel rounded-2xl px-6 py-12 text-center">
              <h2 className="text-headline-md">Kurslar hazırlanır</h2>
              <p className="mx-auto mt-2 max-w-md text-body-md text-on-surface-variant">
                Hələ dərc edilmiş kurs yoxdur. Yol hərəkəti qaydaları üzrə kurslar tezliklə burada
                görünəcək.
              </p>
              <Link
                href="/chat"
                className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' mt-5'}
              >
                AI köməkçiyə sual ver
              </Link>
            </div>
          ) : (
            <CourseGrid balance={balance} courses={courses} />
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
