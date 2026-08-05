import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { FineIcon, SignIcon, TrophyIcon, ShieldIcon } from '@/components/icons';
import { getCategoryContent } from '@/lib/content/categoryContent';
import { SIGNS_COURSE_HREF } from '@/lib/content/courseLinks';
import { createClient } from '@/lib/supabase/server';
import { getCoinBalanceStatus } from '@/lib/chat/coins';
import { getCourses } from '@/lib/quiz/lessons';
import { getStreakStatus, getQuizRewardAmount, hasClaimedToday, type StreakStatus } from '@/lib/coins/quiz';
import { getDailyQuestionForUser } from '@/lib/quiz/questions';
import EditorialDashboard, { type EditorialQuickLink } from '@/components/home/EditorialDashboard';

export const metadata: Metadata = {
  title: 'Ana Səhifə',
};

// PERSONAL DASHBOARD. Everything here is per-user and session-bound, which is
// exactly why it is no longer merged into `/`: that merge is what turned the
// public landing page into a per-request dynamic route (see the note in
// app/page.tsx).
//
// proxy.ts guards /home and sends anonymous visitors to /login, and separately
// sends signed-in visitors from `/` to here. The redirect below is the second
// line of defence — proxy.ts does a cookie-only optimistic check and is never
// the authorization on its own, the same rule every other gated page follows.
export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .maybeSingle();

  const isAdmin = profile?.role === 'admin';
  // Falls back to the email local-part when no full_name is set, the same
  // chain components/MobileAccountMenu.tsx already uses for its display name —
  // so the greeting says who the user actually is instead of a generic noun.
  // Still null if neither exists, in which case the greeting drops the name
  // entirely rather than inventing one.
  const firstName = profile?.full_name?.trim().split(/\s+/)[0] || user.email?.split('@')[0] || null;
  // Admins are exempt from the coin economy (same convention as
  // app/coin-qazan/page.tsx and app/account/page.tsx) — no balance/daily quiz
  // to show them.
  const showCoinEconomy = !isAdmin;

  const [courses, streakStatus, coinStatus, quizReward, quizAlreadyClaimed, categories] =
    await Promise.all([
      getCourses(user.id),
      getStreakStatus(user.id),
      showCoinEconomy ? getCoinBalanceStatus(user.id) : Promise.resolve(null),
      showCoinEconomy ? getQuizRewardAmount() : Promise.resolve(0),
      showCoinEconomy ? hasClaimedToday(user.id) : Promise.resolve(false),
      getCategoryContent(),
    ]);

  // Synchronous (seeded by date+userId), not part of the Promise.all above —
  // same call shape as app/coin-qazan/page.tsx.
  const dailyQuestion = showCoinEconomy ? getDailyQuestionForUser(user.id, new Date()) : null;

  const totalTopics = courses.reduce((sum, c) => sum + c.totalTopics, 0);
  const passedTopics = courses.reduce((sum, c) => sum + c.passedTopics, 0);
  const progress = {
    totalTopics,
    passedTopics,
    progressPct: totalTopics > 0 ? Math.round((passedTopics / totalTopics) * 100) : 0,
  };

  // "Sürətli Keçid" grid. Cərimələr routes into its real category via the same
  // /chat?q= pattern the landing's topic cards use; Nişanlar deep-links into the
  // road-signs course (the owner's ask — a learner clicking the signs tile wants
  // to LEARN signs, not ask one question). Xidmətlər has no route anywhere in
  // app/** — rendered as a disabled "tezliklə" tile (href: null) rather than
  // guessing a URL.
  const fineCategory = categories.find((category) => category.title === 'Cərimələr və Bal Sistemi')!;
  const quickLinks: EditorialQuickLink[] = [
    {
      key: 'fines',
      label: 'Cərimələr',
      caption: 'AI-dan soruş',
      icon: FineIcon,
      iconSrc: '/icons/money-icon.png',
      href: `/chat?q=${encodeURIComponent(fineCategory.question)}`,
    },
    {
      key: 'signs',
      label: 'Nişanlar',
      caption: 'Kurs',
      icon: SignIcon,
      iconSrc: '/icons/nisan-icon-3.png',
      href: SIGNS_COURSE_HREF,
    },
    {
      key: 'exam',
      label: 'İmtahan',
      caption: 'Simulyasiya',
      icon: TrophyIcon,
      iconSrc: '/icons/exam-icon.png',
      href: '/imtahan',
    },
    {
      key: 'services',
      label: 'Xidmətlər',
      caption: 'Tezliklə',
      icon: ShieldIcon,
      iconSrc: '/icons/service-icon.png',
      href: null,
    },
  ];

  return (
    <EditorialDashboard
      firstName={firstName}
      coinBalance={coinStatus?.balance ?? null}
      progress={progress}
      streakStatus={streakStatus as StreakStatus}
      dailyQuiz={
        dailyQuestion
          ? {
              question: dailyQuestion.question,
              options: dailyQuestion.options,
              alreadyClaimed: quizAlreadyClaimed,
              reward: quizReward,
            }
          : null
      }
      quickLinks={quickLinks}
    />
  );
}
