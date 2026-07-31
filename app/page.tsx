import { FineIcon, ChatIcon, RulesIcon, CoinIcon, TrophyIcon, SignIcon, ShieldIcon } from '@/components/icons';
import { getCategoryContent, getCategoryQuestionCounts } from '@/lib/content/categoryContent';
import { getRegisteredDriverCount, getRecentDriverInitials } from '@/lib/content/getRegisteredDriverCount';
import DesignSwitch from '@/components/design3d/DesignSwitch';
import HomePage3D from '@/components/design3d/HomePage3D';
import { getServerDesign } from '@/lib/design/getServerDesign';
import { createClient } from '@/lib/supabase/server';
import { getCoinBalanceStatus } from '@/lib/chat/coins';
import { getCourses } from '@/lib/quiz/lessons';
import { getStreakStatus, getQuizRewardAmount, hasClaimedToday, type StreakStatus } from '@/lib/coins/quiz';
import { getDailyQuestionForUser } from '@/lib/quiz/questions';
import EtherealHome, { type EtherealQuickLink } from '@/components/home/EtherealHome';

// NOTE ON DYNAMIC RENDERING: this page used to be a pure ISR page (no
// cookies() call anywhere, service-role reads only) — one of the six routes
// CLAUDE.md's Vercel-Hobby-function-budget section calls out as "would go
// static if [the cookies() dependency] were moved client-side". The mobile
// dashboard tree below is real, per-user, session-aware content (coin
// balance, streak, daily quiz), which requires supabase.auth.getUser() and
// therefore cookies() — so `/` is now unavoidably dynamic-per-request like
// most of the rest of the app. `revalidate` below is now inert for the
// dynamic path; left in place only because removing it doesn't change
// behavior. Flagged here rather than silently reintroducing the exact
// function-budget regression CLAUDE.md warns about.
export const revalidate = 3600;

const EMPTY_STREAK: StreakStatus = { current: 0, longest: 0, nextMilestone: null, nextMilestoneBonus: null };

// Home page preview: the 6 most commonly-asked categories out of the full 8
// in RULE_CATEGORIES — "Kəsişmələr və Üstünlük Hüququ" and "Dayanma və
// Dayanacaq Qaydaları" are intentionally left off this preview and only
// shown as lessons on the full /oyrenme list.
const HOME_TOPIC_TITLES = [
  'Nişanlar',
  'Qaydalar',
  'Cərimələr və Bal Sistemi',
  'Piyada Hərəkəti',
  'Sürət Həddi',
  'Sənədlər və Sığorta',
];
const PROMO_FEATURES = [
  'Rəsmi sənədlərə əsaslanan, mənbəyə istinad edən cavablar',
  'Azərbaycan dilində sual-cavab dəstəyi',
  '24/7 əlçatan AI köməkçi',
];

// MOCK: "Düzgün cavab nisbəti" has no real accuracy-tracking metric behind
// it (no user feedback/rating system exists yet) and "24/7" is a descriptive
// fact about support availability, not a measured figure — both stay
// illustrative placeholders. The registered-user count next to them (first
// tile, added in the component body below) is real, from
// getRegisteredDriverCount().
const MOCK_STATS_TAIL = [
  { value: '98%', label: 'Düzgün cavab nisbəti', accent: 'text-go-green' },
  { value: '24/7', label: 'Hüquqi dəstək', accent: 'text-regulatory-blue' },
];

// "What you can do here" — the app's four pillars, linking to each. Accent
// colours cycle through the same traffic-signal palette the category cards use,
// so the landing page reads as one system.
const FEATURES = [
  {
    icon: ChatIcon,
    title: 'AI Söhbət',
    desc: 'Yol qaydaları ilə bağlı istənilən sualı yaz — rəsmi sənədlərə əsaslanan, mənbəyə istinad edən cavab al. Vəziyyətin şəklini də göndərə bilərsən.',
    href: '/chat',
    cta: 'Suala başla',
    chip: 'bg-primary/15 text-primary',
    border: 'border-l-primary',
  },
  {
    icon: RulesIcon,
    title: 'Sürücülük dərsləri',
    desc: 'Kateqoriyalar üzrə dərsləri oxu, hər mövzunun sonundakı testi keç və irəliləyişini izlə — sürücülük vəsiqəsi imtahanına addım-addım hazırlaş.',
    href: '/oyrenme',
    cta: 'Dərslərə başla',
    chip: 'bg-regulatory-blue/15 text-regulatory-blue',
    border: 'border-l-regulatory-blue',
  },
  {
    icon: CoinIcon,
    title: 'Coin qazan',
    desc: 'Gündəlik sual, ardıcıllıq seriyası, dostları dəvət və reklam izləmə ilə coin topla. Coinlərlə pulsuz gündəlik limitdən sonra da AI söhbətini davam etdir.',
    href: '/coin-qazan',
    cta: 'Coin qazan',
    chip: 'bg-safety-yellow/15 text-safety-yellow',
    border: 'border-l-safety-yellow',
  },
  {
    icon: TrophyIcon,
    title: 'Oyunlar və Çarx',
    desc: 'Kompüterə qarşı XO oyna, gündəlik pulsuz çarxı fırlat və həftəlik reytinqdə yerini tut — əylənərək coin qazan.',
    href: '/coin-qazan',
    cta: 'Oynamağa başla',
    chip: 'bg-go-green/15 text-go-green',
    border: 'border-l-go-green',
  },
];

// How coins are earned (shown in the coin-explainer section). These mirror the
// real earning mechanics on /coin-qazan.
const COIN_EARN = [
  'Gündəlik sualı düzgün cavabla',
  'Ardıcıl günlərdə seriyanı qoru (streak bonusu)',
  'XO oyna və gündəlik çarxı fırlat',
  'Dostlarını dəvət et',
  'Reklam izlə',
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [design, driverCount, driverInitials, categories, questionCounts] =
    await Promise.all([
      getServerDesign(),
      getRegisteredDriverCount(),
      getRecentDriverInitials(),
      getCategoryContent(),
      getCategoryQuestionCounts(),
    ]);

  // Mobile-only personalized data, fetched unconditionally server-side (this
  // is a server component; gating the *fetch* on viewport would require an
  // unreliable UA sniff — CSS handles which tree is visually shown, see the
  // md:hidden / md:contents split in the returned JSX below).
  let mobileProfile: { full_name: string | null; role: string } | null = null;
  if (user) {
    const { data } = await supabase
      .from('profiles')
      .select('full_name, role')
      .eq('id', user.id)
      .maybeSingle();
    mobileProfile = data;
  }
  const isAdmin = mobileProfile?.role === 'admin';
  const firstName = mobileProfile?.full_name?.trim().split(/\s+/)[0] || null;
  // Admins are exempt from the coin economy (same convention as
  // app/coin-qazan/page.tsx and app/account/page.tsx) — no balance/daily quiz
  // to show them.
  const showCoinEconomy = Boolean(user) && !isAdmin;

  const [courses, mobileStreakStatus, mobileCoinStatus, quizReward, quizAlreadyClaimed] = await Promise.all([
    user ? getCourses(user.id) : Promise.resolve([]),
    user ? getStreakStatus(user.id) : Promise.resolve(EMPTY_STREAK),
    showCoinEconomy ? getCoinBalanceStatus(user!.id) : Promise.resolve(null),
    showCoinEconomy ? getQuizRewardAmount() : Promise.resolve(0),
    showCoinEconomy ? hasClaimedToday(user!.id) : Promise.resolve(false),
  ]);
  // Synchronous (seeded by date+userId), not part of the Promise.all above —
  // same call shape as app/coin-qazan/page.tsx.
  const mobileDailyQuestion = showCoinEconomy ? getDailyQuestionForUser(user!.id, new Date()) : null;

  const mobileTotalTopics = courses.reduce((sum, c) => sum + c.totalTopics, 0);
  const mobilePassedTopics = courses.reduce((sum, c) => sum + c.passedTopics, 0);
  const mobileProgress = {
    totalTopics: mobileTotalTopics,
    passedTopics: mobilePassedTopics,
    progressPct: mobileTotalTopics > 0 ? Math.round((mobilePassedTopics / mobileTotalTopics) * 100) : 0,
  };
  // Admin-overridable content, so TOPICS is built per render (ISR-cached)
  // rather than at module scope from the raw defaults.
  const topics = HOME_TOPIC_TITLES.map(
    (title) => categories.find((category) => category.title === title)!
  );
  // Real citation reused (not invented) for the hero's floating "cərimə" alert
  // card — sourced from the same merged entry the bento grid below renders, so
  // the hero doesn't introduce a second, drifting copy of it.
  const fineCategory = categories.find((category) => category.title === 'Cərimələr və Bal Sistemi')!;
  const formattedDriverCount = driverCount.toLocaleString('az-AZ');
  const stats = [
    { value: formattedDriverCount, label: 'Aktiv istifadəçi', accent: 'text-primary' },
    ...MOCK_STATS_TAIL,
  ];

  // Mobile "Sürətli Keçid" grid. Cərimələr/Nişanlar route into real
  // categories from getCategoryContent() (same /chat?q= pattern as
  // CategoryCard below). İmtahan and Xidmətlər have no dedicated route
  // anywhere in app/** (confirmed via glob) — rendered as disabled
  // "tezliklə" tiles (href: null) rather than guessing a URL, per the task
  // brief. Flagged back: neither exists yet.
  const nisanlarCategory = categories.find((category) => category.title === 'Nişanlar');
  const mobileQuickLinks: EtherealQuickLink[] = [
    { key: 'fines', label: 'Cərimələr', icon: FineIcon, href: `/chat?q=${encodeURIComponent(fineCategory.question)}` },
    {
      key: 'signs',
      label: 'Nişanlar',
      icon: SignIcon,
      href: nisanlarCategory ? `/chat?q=${encodeURIComponent(nisanlarCategory.question)}` : null,
    },
    { key: 'exam', label: 'İmtahan', icon: TrophyIcon, href: null },
    { key: 'services', label: 'Xidmətlər', icon: ShieldIcon, href: null },
  ];
  // Phase 1 of the second "Cyber-Circuit Legal" design (see
  // components/design3d/): a client-side switch chooses between the
  // unmodified JSX below (`simple`, also the default/SSR-matching tree) and
  // the new HomePage3D tree (`threeD`), both built from the exact same data
  // fetched above. Every other page in the app is untouched — this is the
  // only page with a second design in this phase.
  return (
    <DesignSwitch
      design={design}
      simple={
        <EtherealHome
          isLoggedIn={Boolean(user)}
          firstName={firstName}
          coinBalance={mobileCoinStatus?.balance ?? null}
          progress={mobileProgress}
          streakStatus={mobileStreakStatus}
          dailyQuiz={
            mobileDailyQuestion
              ? {
                  question: mobileDailyQuestion.question,
                  options: mobileDailyQuestion.options,
                  alreadyClaimed: quizAlreadyClaimed,
                  reward: quizReward,
                }
              : null
          }
          quickLinks={mobileQuickLinks}
          topics={topics}
          questionCounts={questionCounts}
          featureCards={FEATURES}
          coinEarn={COIN_EARN}
          promoFeatures={PROMO_FEATURES}
          stats={stats}
          formattedDriverCount={formattedDriverCount}
          driverInitials={driverInitials}
        />
      }
      threeD={
        <HomePage3D
          formattedDriverCount={formattedDriverCount}
          driverInitials={driverInitials}
          stats={stats}
          topics={topics}
          questionCounts={questionCounts}
          fineCategory={fineCategory}
        />
      }
    />
  );
}
