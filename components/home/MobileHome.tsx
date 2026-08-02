import Link from 'next/link';
import { buttonVariants } from '@heroui/styles';
import type { ComponentType, SVGProps } from 'react';
import DailyQuizCard from '@/components/account/DailyQuizCard';
import MobileAccountMenu from '@/components/MobileAccountMenu';
import ThemeToggle from '@/components/ThemeToggle';
import { CoinIcon, EnergyIcon, ArrowRightIcon, ArrowUpIcon, FlameIcon } from '@/components/icons';
import type { RuleCategory } from '@/lib/content/ruleCategories';
import type { StreakStatus } from '@/lib/coins/quiz';

// Per-tile accent rotation for the "Sürətli Keçid" grid — mirrors the same
// traffic-signal accent cycle app/page.tsx's desktop FEATURES array uses, so
// the mobile dashboard reads as the same system rather than a flat single
// tint repeated four times.
const QUICK_LINK_ACCENTS = [
  { chip: 'bg-primary/15 text-primary' },
  { chip: 'bg-regulatory-blue/15 text-regulatory-blue' },
  { chip: 'bg-safety-yellow/15 text-safety-yellow' },
  { chip: 'bg-go-green/15 text-go-green' },
];

export interface MobileQuickLink {
  key: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** null renders a disabled "tezliklə" tile instead of guessing a route. */
  href: string | null;
}

export interface MobileLearningProgress {
  passedTopics: number;
  totalTopics: number;
  progressPct: number;
}

export interface MobileDailyQuiz {
  question: string;
  options: string[];
  alreadyClaimed: boolean;
  reward: number;
}

export interface MobileHomeProps {
  /** Whether a session exists at all — distinguishes "logged out" from
   * "logged in but coin-economy-exempt admin" for coinBalance/dailyQuiz below,
   * both of which are null in both of those cases. */
  isLoggedIn: boolean;
  /** First name of the authenticated user, or null when logged out. */
  firstName: string | null;
  /** Real user_coins balance; null when logged out OR admin (coin-exempt). */
  coinBalance: number | null;
  progress: MobileLearningProgress;
  streakStatus: StreakStatus;
  /** null when logged out or admin (coin economy doesn't apply to admins). */
  dailyQuiz: MobileDailyQuiz | null;
  quickLinks: MobileQuickLink[];
  /** Subset of getCategoryContent() for the "recommended topics" list. */
  topics: RuleCategory[];
  questionCounts: Record<string, number>;
}

// Mobile-only app-dashboard shell for the logged-in (and logged-out
// fallback) home experience — see legaldrive-design skill's "Home page —
// mobile" section for the structure this follows. Rendered only inside the
// md:hidden wrapper in app/page.tsx; desktop's marketing tree is untouched.
export default function MobileHome({
  isLoggedIn,
  firstName,
  coinBalance,
  progress,
  streakStatus,
  dailyQuiz,
  quickLinks,
  topics,
  questionCounts,
}: MobileHomeProps) {
  // Last-5-day activity strip derived from the real streak count — not real
  // per-day dates (no daily-activity-log table exists), just a "how much of
  // a 5-day window is covered by the current streak" indicator.
  const activeDays = Math.min(streakStatus.current, 5);

  return (
    <div className="flex flex-col pb-24">

      <div className="px-4 pt-5">
        <p className="text-body-md text-on-surface-variant">
          {firstName ? 'Xoş gəldiniz,' : 'Xoş gəldiniz!'}
        </p>
        {firstName && (
          <h1 className="text-display-lg text-[28px] text-on-surface">{firstName}!</h1>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 px-4 pt-4">
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <p className="text-label-sm text-on-surface-variant">Təhsil Proqresi</p>
            <ArrowUpIcon width={14} height={14} className="text-go-green" />
          </div>
          <p className="mt-1 text-3xl font-extrabold text-primary">{progress.progressPct}%</p>
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-outline-variant/30">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${progress.progressPct}%` }}
            />
          </div>
          <p className="mt-2 text-legal-citation text-on-surface-variant">
            {progress.passedTopics}/{progress.totalTopics} mövzu tamamlanıb
          </p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <p className="text-label-sm text-on-surface-variant">Aktivlik</p>
            <FlameIcon
              width={14}
              height={14}
              className={streakStatus.current > 0 ? 'streak-flame motion-reduce:animate-none text-caution-orange' : 'text-on-surface-variant'}
            />
          </div>
          <p className="mt-1 text-3xl font-extrabold text-caution-orange">{streakStatus.current} gün</p>
          <div className="mt-2.5 flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className={`h-1.5 flex-1 rounded-full ${
                  i < activeDays ? 'bg-caution-orange' : 'bg-outline-variant/30'
                }`}
              />
            ))}
          </div>
          <p className="mt-2 text-legal-citation text-on-surface-variant">
            Ən uzun seriya: {streakStatus.longest} gün
          </p>
        </div>
      </div>

      <div className="px-4 pt-4">
        {dailyQuiz ? (
          <DailyQuizCard
            question={dailyQuiz.question}
            options={dailyQuiz.options}
            alreadyClaimed={dailyQuiz.alreadyClaimed}
            reward={dailyQuiz.reward}
            streakStatus={streakStatus}
          />
        ) : isLoggedIn ? (
          // Admin: coin economy doesn't apply to this account — an honest
          // neutral state, not a "please log in" prompt to someone already
          // logged in.
          <div className="glass-card space-y-3 rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-outline-variant/20 text-on-surface-variant">
                <CoinIcon />
              </div>
              <h2 className="text-headline-md text-[18px]">Bugünkü sual</h2>
            </div>
            <p className="text-body-md text-on-surface-variant">
              Admin hesabları coin sisteminə daxil deyil.
            </p>
          </div>
        ) : (
          <div className="glass-card space-y-3 rounded-2xl p-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-caution-orange/15 text-caution-orange">
                <EnergyIcon />
              </div>
              <h2 className="text-headline-md text-[18px]">Bugünkü sual</h2>
            </div>
            <p className="text-body-md text-on-surface-variant">
              Gündəlik sualı cavablayıb enerji qazanmaq üçün daxil olun.
            </p>
            <Link
              href="/login"
              className={buttonVariants({ variant: 'primary', size: 'md' }) + ' glow-primary w-fit'}
            >
              Daxil ol
            </Link>
          </div>
        )}
      </div>

      <div className="px-4 pt-6">
        <h2 className="mb-3 text-headline-md text-[18px]">Sürətli Keçid</h2>
        <div className="grid grid-cols-2 gap-3">
          {quickLinks.map((item, i) => {
            const Icon = item.icon;
            const disabled = item.href == null;
            const accent = QUICK_LINK_ACCENTS[i % QUICK_LINK_ACCENTS.length];
            const content = (
              <div
                className={`glass-card relative flex flex-col items-center gap-2 rounded-2xl p-4 text-center ${
                  disabled
                    ? 'opacity-45 grayscale-[40%]'
                    : 'transition duration-200 hover:-translate-y-0.5 active:scale-[0.97]'
                }`}
              >
                {disabled && (
                  <span className="text-legal-citation absolute top-2 right-2 rounded-full bg-outline-variant/25 px-1.5 py-0.5 text-[9px] text-on-surface-variant">
                    Tezliklə
                  </span>
                )}
                <div
                  className={`flex size-11 items-center justify-center rounded-xl ${
                    disabled ? 'bg-outline-variant/20 text-on-surface-variant' : accent.chip
                  }`}
                >
                  <Icon />
                </div>
                <span className="text-label-sm text-on-surface">{item.label}</span>
              </div>
            );

            return disabled ? (
              <div key={item.key} aria-disabled="true" className="cursor-not-allowed">
                {content}
              </div>
            ) : (
              <Link key={item.key} href={item.href!}>
                {content}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="px-4 pt-6">
        <h2 className="mb-3 text-headline-md text-[18px]">Məsləhət görülən mövzular</h2>
        <div className="space-y-2">
          {topics.map((topic) => {
            const Icon = topic.icon;
            return (
              <Link
                key={topic.title}
                href={`/chat?q=${encodeURIComponent(topic.question)}`}
                className="glass-card flex items-center gap-3 rounded-2xl p-3 transition duration-200 hover:-translate-y-0.5 active:scale-[0.98]"
              >
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <Icon />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-md font-medium text-on-surface">{topic.title}</p>
                  <p className="truncate text-legal-citation text-on-surface-variant">
                    {topic.citation}
                    {questionCounts[topic.title] ? ` · ${questionCounts[topic.title]} sual` : ''}
                  </p>
                </div>
                <ArrowRightIcon className="shrink-0 text-on-surface-variant" width={16} height={16} />
              </Link>
            );
          })}
        </div>
      </div>

    </div>
  );
}
