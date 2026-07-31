import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getQuizRewardAmount, hasClaimedToday, getStreakStatus } from '@/lib/coins/quiz';
import { getOrCreateReferralCode, getReferralBonusAmount } from '@/lib/coins/referrals';
import {
  getAdWatchRewardAmount,
  getAdWatchDailyMax,
  getAdWatchClaimsToday,
  getAdViewDurationSeconds,
} from '@/lib/coins/adWatch';
import { getDailyQuestionForUser } from '@/lib/quiz/questions';
import { getWeeklyLeaderboard } from '@/lib/coins/leaderboard';
import { getCoinBalanceStatus } from '@/lib/chat/coins';
import {
  getEnergyStatus,
  getEnergyPurchaseConfig,
} from '@/lib/coins/games';
import { getWheelStatus } from '@/lib/coins/wheel';
import { getDailyQuestStatus } from '@/lib/coins/dailyQuests';
import { getCarTiers } from '@/lib/garage/carTiers';
import { getUserGarage } from '@/lib/garage/garage';
import { getActiveGaragePerk } from '@/lib/garage/perks';
import { ensureFreePlate, getUserPlate, getVipPlatePrice } from '@/lib/garage/plates';
import GamesShowcase from '@/components/games/GamesShowcase';
import WheelGame from '@/components/games/WheelGame';
import DailyQuizCard from '@/components/account/DailyQuizCard';
import DailyQuestCard from '@/components/coins/DailyQuestCard';
import GarageCard from '@/components/coins/GarageCard';
import MobileCoinQazan from '@/components/coins/MobileCoinQazan';
import PlateMarketCard from '@/components/coins/PlateMarketCard';
import ReferralCard from '@/components/account/ReferralCard';
import AdWatchCard from '@/components/account/AdWatchCard';
import WeeklyLeaderboardCard from '@/components/account/WeeklyLeaderboardCard';
import Footer from '@/components/Footer';
import { ArrowLeftIcon } from '@/components/icons';
import DesignSwitch from '@/components/design3d/DesignSwitch';
import CoinQazanPage3D from '@/components/design3d/CoinQazanPage3D';
import { getServerDesign } from '@/lib/design/getServerDesign';

export const metadata: Metadata = {
  title: 'Coin Qazan',
};

export default async function CoinQazanPage() {
  const design = await getServerDesign();
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
    streakStatus,
    referralCode,
    referralBonusAmount,
    adWatchReward,
    adWatchDailyMax,
    adWatchClaimsToday,
    adViewDurationSeconds,
    weeklyLeaderboard,
    coinStatus,
    energyStatus,
    wheelStatus,
    energyPurchaseConfig,
    dailyQuestStatus,
    carTiers,
    userGarage,
    garagePerk,
    plateNumber,
    vipPlatePrice,
  ] = await Promise.all([
    getQuizRewardAmount(),
    hasClaimedToday(user.id),
    getStreakStatus(user.id),
    getOrCreateReferralCode(user.id),
    getReferralBonusAmount(),
    getAdWatchRewardAmount(),
    getAdWatchDailyMax(),
    getAdWatchClaimsToday(user.id),
    getAdViewDurationSeconds(),
    getWeeklyLeaderboard(user.id),
    getCoinBalanceStatus(user.id),
    getEnergyStatus(user.id),
    getWheelStatus(user.id),
    getEnergyPurchaseConfig(),
    getDailyQuestStatus(user.id),
    getCarTiers(),
    getUserGarage(user.id),
    getActiveGaragePerk(user.id),
    // WRITE the first time (lazily assigns + persists a free plate), called
    // the exact same way getOrCreateReferralCode is above — already proven
    // safe inside this page's render-time Promise.all.
    ensureFreePlate(user.id),
    getVipPlatePrice(),
  ]);

  // ensureFreePlate only returns the plate string; isCustom comes from a
  // follow-up read (the row it just wrote/confirmed is already there, so
  // this is not a race) rather than threading a richer return type through
  // the write path.
  const plate = await getUserPlate(user.id);
  const isCustomPlate = plate?.isCustom ?? false;

  // Strip correctIndex before it ever reaches the client component's props —
  // the server action re-derives it server-side from (userId, today) when
  // the answer is submitted.
  const dailyQuestion = getDailyQuestionForUser(user.id, new Date());

  // Mirrors components/AdSlot.tsx's convention for gating ad-dependent UI.
  const adsEnabled = process.env.NEXT_PUBLIC_ADS_ENABLED === 'true';

  // Each card is built once and reused by BOTH the `simple` and `threeD`
  // trees below (DesignSwitch only ever mounts one of the two at a time, so
  // sharing the same element descriptors is safe — same pattern the two
  // trees would produce independently, just without duplicating every prop
  // list). Internal render logic/server-action wiring is completely
  // untouched either way; only the surrounding chrome differs per design.
  const dailyQuestCard = <DailyQuestCard status={dailyQuestStatus} />;
  const weeklyLeaderboardCard = <WeeklyLeaderboardCard leaderboard={weeklyLeaderboard} />;
  const garageCard = (
    <GarageCard tiers={carTiers} garage={userGarage} coinBalance={coinStatus.balance} perk={garagePerk} />
  );
  const plateMarketCard = (
    <PlateMarketCard
      plateNumber={plateNumber}
      isCustom={isCustomPlate}
      coinBalance={coinStatus.balance}
      price={vipPlatePrice}
    />
  );
  const dailyQuizCard = (
    <DailyQuizCard
      question={dailyQuestion.question}
      options={dailyQuestion.options}
      alreadyClaimed={quizAlreadyClaimed}
      reward={quizReward}
      streakStatus={streakStatus}
    />
  );
  const referralCard = <ReferralCard code={referralCode} bonusAmount={referralBonusAmount} />;
  const adWatchCard = (
    <AdWatchCard
      adsEnabled={adsEnabled}
      reward={adWatchReward}
      dailyMax={adWatchDailyMax}
      claimsToday={adWatchClaimsToday}
      durationSeconds={adViewDurationSeconds}
    />
  );
  // The three games no longer render inline behind a tab strip — each opens
  // its own page at /coin-qazan/<slug>. ticTacToeTodayCount / ticTacToeWinReward
  // are read by that route now, not here.
  const gamesSection = (
    <GamesShowcase
      initialBalance={coinStatus.balance}
      initialEnergy={energyStatus.balance}
      maxEnergy={energyStatus.max}
      energyPurchaseCoinCost={energyPurchaseConfig.coinCost}
      energyPurchaseEnergyAmount={energyPurchaseConfig.energyAmount}
    />
  );
  const wheelGame = <WheelGame prizes={wheelStatus.prizes} initialStatus={wheelStatus.status} />;

  return (
    <DesignSwitch
      design={design}
      simple={
        <>
        {/* Mobile shell (see components/coins/MobileCoinQazan.tsx) — CSS-only
            split via md:hidden, same convention as /oyrenme/[courseId]. It
            mounts the exact same card elements as the desktop tree below;
            only the surrounding chrome differs. */}
        <div className="md:hidden">
          <MobileCoinQazan
            coinBalance={coinStatus.balance}
            streakDays={streakStatus.current}
            longestStreak={streakStatus.longest}
            dailyQuestCard={dailyQuestCard}
            dailyQuizCard={dailyQuizCard}
            gamesSection={gamesSection}
            wheelGame={wheelGame}
            garageCard={garageCard}
            plateMarketCard={plateMarketCard}
            referralCard={referralCard}
            adWatchCard={adWatchCard}
            weeklyLeaderboardCard={weeklyLeaderboardCard}
          />
        </div>

        <div className="hidden space-y-6 px-4 pt-8 pb-16 md:block md:px-8">
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
            {dailyQuestCard}
            {weeklyLeaderboardCard}
            {garageCard}
            {plateMarketCard}
            {dailyQuizCard}
            {referralCard}
            {adWatchCard}
            {gamesSection}
            {wheelGame}
          </div>

          <Footer />
        </div>
        </>
      }
      threeD={
        <CoinQazanPage3D
          coinBalance={coinStatus.balance}
          streakDays={streakStatus.current}
          dailyQuestCard={dailyQuestCard}
          weeklyLeaderboardCard={weeklyLeaderboardCard}
          garageCard={garageCard}
          plateMarketCard={plateMarketCard}
          dailyQuizCard={dailyQuizCard}
          referralCard={referralCard}
          adWatchCard={adWatchCard}
          gamesSection={gamesSection}
          wheelGame={wheelGame}
        />
      }
    />
  );
}
