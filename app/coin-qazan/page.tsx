import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@heroui/styles';
import { createClient } from '@/lib/supabase/server';
import { getQuizRewardAmount, hasClaimedToday, getQuizStreak } from '@/lib/coins/quiz';
import { getOrCreateReferralCode, getReferralBonusAmount } from '@/lib/coins/referrals';
import {
  getAdWatchRewardAmount,
  getAdWatchDailyMax,
  getAdWatchClaimsToday,
  getAdViewDurationSeconds,
} from '@/lib/coins/adWatch';
import { getDailyQuestionForUser } from '@/lib/quiz/questions';
import DailyQuizCard from '@/components/account/DailyQuizCard';
import ReferralCard from '@/components/account/ReferralCard';
import AdWatchCard from '@/components/account/AdWatchCard';
import Footer from '@/components/Footer';
import { ArrowLeftIcon, RulesIcon, CoinIcon } from '@/components/icons';

export const metadata: Metadata = {
  title: 'Coin Qazan',
};

export default async function CoinQazanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  // Admins are exempt from the coin economy entirely (no balance/limit to
  // spend, per getCoinBalanceStatus's `exempt` flag) — there's nothing to
  // earn towards, so send them back rather than show an empty/irrelevant page.
  if (profile?.role === 'admin') redirect('/account');

  const [
    quizReward,
    quizAlreadyClaimed,
    quizStreak,
    referralCode,
    referralBonusAmount,
    adWatchReward,
    adWatchDailyMax,
    adWatchClaimsToday,
    adViewDurationSeconds,
  ] = await Promise.all([
    getQuizRewardAmount(),
    hasClaimedToday(user.id),
    getQuizStreak(user.id),
    getOrCreateReferralCode(user.id),
    getReferralBonusAmount(),
    getAdWatchRewardAmount(),
    getAdWatchDailyMax(),
    getAdWatchClaimsToday(user.id),
    getAdViewDurationSeconds(),
  ]);

  // Strip correctIndex before it ever reaches the client component's props —
  // the server action re-derives it server-side from (userId, today) when
  // the answer is submitted.
  const dailyQuestion = getDailyQuestionForUser(user.id, new Date());

  // Mirrors components/AdSlot.tsx's convention for gating ad-dependent UI.
  const adsEnabled = process.env.NEXT_PUBLIC_ADS_ENABLED === 'true';

  return (
    <div className="space-y-6 px-4 pt-8 pb-16 md:px-8">
      <div>
        <Link
          href="/account"
          className="mb-4 inline-flex items-center gap-1.5 text-label-sm text-on-surface-variant hover:text-on-surface"
        >
          <ArrowLeftIcon width={14} height={14} />
          Hesaba qayıt
        </Link>
        <h1 className="text-headline-md text-on-surface">Coin Qazan</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Coin qazanmağın bütün yolları burada toplanıb — gündəlik sual, dostlarını dəvət etmək,
          reklam izləmək və dərsləri tamamlamaq.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DailyQuizCard
          question={dailyQuestion.question}
          options={dailyQuestion.options}
          alreadyClaimed={quizAlreadyClaimed}
          reward={quizReward}
          streak={quizStreak}
        />

        <ReferralCard code={referralCode} bonusAmount={referralBonusAmount} />

        <AdWatchCard
          adsEnabled={adsEnabled}
          reward={adWatchReward}
          dailyMax={adWatchDailyMax}
          claimsToday={adWatchClaimsToday}
          durationSeconds={adViewDurationSeconds}
        />

        <div className="glass-card rounded-2xl p-6 space-y-4 lg:col-span-2">
          <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <RulesIcon />
            </div>
            <h2 className="text-headline-md text-[18px]">Dərslərdən keç</h2>
          </div>
          <p className="text-body-md text-on-surface-variant">
            Sürücülük vəsiqəsi dərslərindəki hər bir sualı ilk dəfə düzgün cavablandıranda coin
            qazanırsan — eyni zamanda yol hərəkəti qaydalarını da öyrənmiş olursan.
          </p>
          <Link
            href="/oyrenme"
            className={buttonVariants({ variant: 'primary', size: 'md' }) + ' glow-primary gap-2'}
          >
            <CoinIcon />
            Dərslərə başla
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
