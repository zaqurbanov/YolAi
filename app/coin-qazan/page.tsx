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
import { getCoinBalanceStatus } from '@/lib/chat/coins';
import { getEnergyStatus, getEnergyPurchaseConfig } from '@/lib/coins/games';
import { getEnergyToCoinStatus } from '@/lib/coins/energyToCoin';
import { getWheelStatus } from '@/lib/coins/wheel';
import { getDailyQuestStatus } from '@/lib/coins/dailyQuests';
import { applyDailyGrant, getDailyGrantStatus } from '@/lib/coins/dailyGrant';
import { getCarTiers } from '@/lib/garage/carTiers';
import { getUserGarage } from '@/lib/garage/garage';
import { getActiveGaragePerk } from '@/lib/garage/perks';
import { ensureFreePlate, getUserPlate, getVipPlatePrice } from '@/lib/garage/plates';
import GamesShowcase from '@/components/games/GamesShowcase';
import WheelGame from '@/components/games/WheelGame';
import DailyQuizCard from '@/components/account/DailyQuizCard';
import DailyQuestCard from '@/components/coins/DailyQuestCard';
import DailyGrantCard from '@/components/coins/DailyGrantCard';
import EnergyConverterCard from '@/components/coins/EnergyConverterCard';
import GaragePreviewCard from '@/components/coins/GaragePreviewCard';
import MobileCoinQazan from '@/components/coins/MobileCoinQazan';
import PlateMarketCard from '@/components/coins/PlateMarketCard';
import ReferralCard from '@/components/account/ReferralCard';
import AdWatchCard from '@/components/account/AdWatchCard';
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

  // The daily floor top-up is automatic (0094). Awaited BEFORE the Promise.all
  // below rather than inside it, so every balance/status read in that batch —
  // coin meter, energy meter, and the informational grant card — observes the
  // same post-top-up state instead of racing it. Idempotent per Baku day.
  await applyDailyGrant(user.id);

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
    coinStatus,
    energyStatus,
    wheelStatus,
    energyPurchaseConfig,
    dailyQuestStatus,
    dailyGrantStatus,
    carTiers,
    userGarage,
    garagePerk,
    plateNumber,
    vipPlatePrice,
    energyToCoinStatus,
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
    getCoinBalanceStatus(user.id),
    getEnergyStatus(user.id),
    getWheelStatus(user.id),
    getEnergyPurchaseConfig(),
    getDailyQuestStatus(user.id),
    getDailyGrantStatus(user.id),
    getCarTiers(),
    getUserGarage(user.id),
    getActiveGaragePerk(user.id),
    // WRITE the first time (lazily assigns + persists a free plate), called
    // the exact same way getOrCreateReferralCode is above — already proven
    // safe inside this page's render-time Promise.all.
    ensureFreePlate(user.id),
    getVipPlatePrice(),
    getEnergyToCoinStatus(user.id),
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
  const dailyGrantCard = <DailyGrantCard status={dailyGrantStatus} />;
  const energyConverterCard = (
    <EnergyConverterCard
      initialBalance={coinStatus.balance}
      initialEnergy={energyStatus.balance}
      maxEnergy={energyStatus.max}
      maxBalance={energyPurchaseConfig.maxBalance}
      coinCost={energyPurchaseConfig.coinCost}
      energyAmount={energyPurchaseConfig.energyAmount}
      maxMultiplier={energyPurchaseConfig.maxMultiplier}
      // One merged Konvertor card covers both directions (coin → energy as a
      // coin SINK, energy → coin as the single sanctioned reverse path) — the
      // energy→coin status feeds the sell half's rate/daily-cap display.
      energyToCoinStatus={energyToCoinStatus}
    />
  );
  // Compact carousel preview, not the full showroom — the full GarageCard +
  // PlateMarketCard now live on the /coin-qazan/qaraj sub-page, which this
  // card links to. Same element flows to the mobile shell, the desktop grid
  // and the 3D tree below.
  const garageCard = (
    <GaragePreviewCard tiers={carTiers} garage={userGarage} coinBalance={coinStatus.balance} perk={garagePerk} />
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
  // Inline trigger for the mobile balance slab — same props, but renders just
  // the "Coin qazan" button + the watch-ad modal, no card chrome.
  const adWatchInlineButton = (
    <AdWatchCard
      adsEnabled={adsEnabled}
      reward={adWatchReward}
      dailyMax={adWatchDailyMax}
      claimsToday={adWatchClaimsToday}
      durationSeconds={adViewDurationSeconds}
      variant="inline"
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
            dailyGrantCard={dailyGrantCard}
            energyConverterCard={energyConverterCard}
            dailyQuestCard={dailyQuestCard}
            dailyQuizCard={dailyQuizCard}
            gamesSection={gamesSection}
            wheelGame={wheelGame}
            garageCard={garageCard}
            plateMarketCard={plateMarketCard}
            referralCard={referralCard}
            adWatchInlineButton={adWatchInlineButton}
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
            {/* The games terminal gets the full row — same rationale as the 3D
                tree's lg:col-span-2 on gamesSection: three game cards inside a
                half-width cell each drop to ~1/6 of the container and feel
                squeezed. */}
            <div className="lg:col-span-2">{gamesSection}</div>
            {wheelGame}
            {dailyGrantCard}
            {energyConverterCard}
            {dailyQuestCard}
            {garageCard}
            {plateMarketCard}
            {dailyQuizCard}
            {referralCard}
            {adWatchCard}
          </div>

          <Footer />
        </div>
        </>
      }
      threeD={
        <CoinQazanPage3D
          coinBalance={coinStatus.balance}
          streakDays={streakStatus.current}
          dailyGrantCard={dailyGrantCard}
          energyConverterCard={energyConverterCard}
          dailyQuestCard={dailyQuestCard}
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
