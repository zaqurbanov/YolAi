import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCourses, getCourseTopics, type TopicSummary } from '@/lib/quiz/lessons';
import { getEnergyStatus } from '@/lib/coins/games';
import DesignSwitch from '@/components/design3d/DesignSwitch';
import OyrenmePage3D from '@/components/design3d/OyrenmePage3D';
import { getServerDesign } from '@/lib/design/getServerDesign';
import CourseGrid from './CourseGrid';
import EditorialOyrenme from '@/components/oyrenme/EditorialOyrenme';

export const metadata: Metadata = {
  title: 'Sürücülük vəsiqəsini al',
};

export default async function OyrenmePage() {
  const design = await getServerDesign();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // `balance` is ENERGY since 0098 — course unlocks spend energy, not coins.
  // getEnergyStatus applies the lazy daily energy top-up as a side effect, so
  // a user who opens /oyrenme already has today's grant before any buy dialog.
  const [courses, balance] = await Promise.all([
    getCourses(user.id),
    getEnergyStatus(user.id)
      .then((s) => s.balance)
      .catch(() => null),
  ]);

  const featuredCourse =
    courses.find((c) => c.isUnlocked && c.totalTopics > 0) ??
    courses.find((c) => c.totalTopics > 0) ??
    null;

  let featuredTopics: TopicSummary[] = [];
  if (featuredCourse) {
    try {
      featuredTopics = await getCourseTopics(featuredCourse.id, user.id);
    } catch {
      featuredTopics = [];
    }
  }

  // Overall progress is counted in TOPICS across all published courses
  const totalTopics = courses.reduce((sum, c) => sum + c.totalTopics, 0);
  const passedTopics = courses.reduce((sum, c) => sum + c.passedTopics, 0);
  const overallPct = totalTopics > 0 ? Math.round((passedTopics / totalTopics) * 100) : 0;

  // Real, derived learning stats for the Editorial stats band. Deliberately
  // only things that can be computed from published rows — there is no
  // time-tracking table and no certificate entity, so "study time" and
  // "certificates earned" are not shown at all rather than invented.
  const unlockedCourses = courses.filter((c) => c.isUnlocked).length;
  const completedCourses = courses.filter(
    (c) => c.totalTopics > 0 && c.passedTopics === c.totalTopics
  ).length;

  const hasCourses = courses.length > 0;
  const emptyStateHud = (
    <div
      className="hud-glass rounded-2xl px-6 py-12 text-center"
      style={{ color: 'var(--hud-on-surface)' }}
    >
      <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--hud-font-display)' }}>
        Kurslar hazırlanır
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: 'var(--hud-on-surface-variant)' }}>
        Hələ dərc edilmiş kurs yoxdur. Yol hərəkəti qaydaları üzrə kurslar tezliklə burada
        görünəcək.
      </p>
      <Link
        href="/chat"
        className="hud-glass mt-5 inline-flex items-center rounded-xl px-5 py-2.5 text-sm font-bold"
        style={{ color: 'var(--hud-cyan)' }}
      >
        AI köməkçiyə sual ver
      </Link>
    </div>
  );
  const courseGrid = <CourseGrid balance={balance} courses={courses} />;

  return (
    <DesignSwitch
      design={design}
      simple={
        <EditorialOyrenme
          courses={courses}
          balance={balance}
          overallPct={overallPct}
          totalTopics={totalTopics}
          passedTopics={passedTopics}
          unlockedCourses={unlockedCourses}
          completedCourses={completedCourses}
          featuredCourse={featuredCourse}
          featuredTopics={featuredTopics}
        />
      }
      threeD={
        <OyrenmePage3D
          totalTopics={totalTopics}
          passedTopics={passedTopics}
          overallPct={overallPct}
          hasCourses={hasCourses}
          courseSection={hasCourses ? courseGrid : emptyStateHud}
        />
      }
    />
  );
}
