import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@heroui/styles';
import { createClient } from '@/lib/supabase/server';
import Footer from '@/components/Footer';
import { RULE_CATEGORIES, categoryToSlug } from '@/lib/content/ruleCategories';
import { getLessons } from '@/lib/quiz/lessons';
import { ACCENT_STYLES } from '@/components/CategoryCard';

export const metadata: Metadata = {
  title: 'Sürücülük vəsiqəsini al',
};

export default async function OyrenmePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const lessons = await getLessons(user.id);
  const lessonByCategory = new Map(lessons.map((l) => [l.category, l]));

  const totalCompleted = lessons.reduce((sum, l) => sum + l.completed, 0);
  const totalQuestions = lessons.reduce((sum, l) => sum + l.total, 0);
  const overallPct = totalQuestions > 0 ? Math.round((totalCompleted / totalQuestions) * 100) : 0;

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
            öyrənmək üçün isə aşağıdakı dərslərə qatıla bilərsiniz.
          </p>

          {totalQuestions > 0 && (
            <div className="glass-panel mt-2 w-full max-w-md rounded-2xl p-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-label-sm text-on-surface-variant">Ümumi irəliləyiş</span>
                <span className="text-label-sm text-go-green">
                  {totalCompleted}/{totalQuestions}
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
              buttonVariants({ variant: 'ghost', size: 'sm' }) + ' mt-2 transition-transform hover:scale-[1.03]'
            }
          >
            Sualınız var? AI köməkçidən soruşun
          </Link>
        </div>
      </section>

      <section className="px-6 py-8 lg:py-12">
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {RULE_CATEGORIES.map((category, i) => {
              const progress = lessonByCategory.get(category.title);
              const total = progress?.total ?? 0;
              const completed = progress?.completed ?? 0;
              const pct = progress?.progressPct ?? 0;
              const accent = ACCENT_STYLES[i % ACCENT_STYLES.length];
              const Icon = category.icon;
              const cta = completed > 0 && completed < total ? 'Davam et' : completed >= total && total > 0 ? 'Təkrar bax' : 'Başla';

              return (
                <Link
                  key={category.title}
                  href={`/oyrenme/${categoryToSlug(category.title)}`}
                  className="block h-full"
                >
                  <div
                    className={`topic-card-in motion-reduce:animate-none glass-card group flex h-full flex-col border border-transparent border-l-4 ${accent.border} p-6 transition duration-200 hover:-translate-y-1 hover:shadow-lg`}
                    style={{ animationDelay: `${i * 80}ms` }}
                  >
                    <div
                      className={`mb-2 flex size-12 items-center justify-center rounded-xl transition duration-200 group-hover:scale-110 ${accent.chip}`}
                    >
                      <Icon />
                    </div>
                    <h3 className="text-headline-md text-[20px]">{category.title}</h3>
                    <p className="mt-1 text-body-md text-on-surface-variant">{category.description}</p>

                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between text-label-sm text-on-surface-variant">
                        <span>İrəliləyiş</span>
                        <span>
                          {completed}/{total}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
                        <div
                          className="h-full rounded-full bg-go-green transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between border-t border-outline-variant/40 pt-3">
                      <span className={`text-legal-citation ${accent.citation}`}>{category.citation}</span>
                      <span className="text-label-sm font-semibold text-primary">{cta} →</span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
