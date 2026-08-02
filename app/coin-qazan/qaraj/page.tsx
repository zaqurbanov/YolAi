import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCoinBalanceStatus } from '@/lib/chat/coins';
import { applyDailyGrant } from '@/lib/coins/dailyGrant';
import { getCarTiers } from '@/lib/garage/carTiers';
import { getUserGarage } from '@/lib/garage/garage';
import { getActiveGaragePerk } from '@/lib/garage/perks';
import { ensureFreePlate, getUserPlate, getVipPlatePrice } from '@/lib/garage/plates';
import GarageCard from '@/components/coins/GarageCard';
import PlateMarketCard from '@/components/coins/PlateMarketCard';
import { ArrowLeftIcon } from '@/components/icons';

export const metadata: Metadata = {
  title: 'Virtual Qaraj',
};

// Full garage sub-page (/coin-qazan/qaraj). /coin-qazan shows the compact
// GaragePreviewCard carousel; this is where the complete GarageCard showroom
// and the PlateMarketCard live. Same data fetch + grant ordering as
// /coin-qazan: auth redirect, admin-exempt redirect, applyDailyGrant BEFORE
// the Promise.all so every balance read observes post-top-up state.
export default async function GaragePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  // Admins are exempt from the coin economy entirely — same as /coin-qazan.
  if (profile?.role === 'admin') redirect('/account');

  await applyDailyGrant(user.id);

  const [carTiers, userGarage, coinStatus, garagePerk, plateNumber, vipPlatePrice] = await Promise.all([
    getCarTiers(),
    getUserGarage(user.id),
    getCoinBalanceStatus(user.id),
    getActiveGaragePerk(user.id),
    // WRITE the first time (lazily assigns + persists a free plate) — same
    // idempotent-write-in-render pattern /coin-qazan already uses.
    ensureFreePlate(user.id),
    getVipPlatePrice(),
  ]);

  // ensureFreePlate only returns the plate string; isCustom comes from a
  // follow-up read (same reasoning as /coin-qazan).
  const plate = await getUserPlate(user.id);
  const isCustomPlate = plate?.isCustom ?? false;

  const garageCard = <GarageCard tiers={carTiers} garage={userGarage} coinBalance={coinStatus.balance} perk={garagePerk} />;
  const plateMarketCard = (
    <PlateMarketCard
      plateNumber={plateNumber}
      isCustom={isCustomPlate}
      coinBalance={coinStatus.balance}
      price={vipPlatePrice}
    />
  );

  return (
    // pb-24 on mobile clears the fixed 64px MobileBottomTabBar (self-gated to
    // /coin-qazan/*); md:pb-16 because the tab bar is hidden on desktop.
    <div className="mx-auto max-w-5xl space-y-6 px-4 pt-8 pb-24 md:px-8 md:pb-16">
      <div>
        <Link
          href="/coin-qazan"
          className="mb-6 inline-flex w-fit items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-primary transition hover:gap-2.5"
        >
          <ArrowLeftIcon width={13} height={13} />
          Coin Qazana qayıt
        </Link>
        <h1 className="text-headline-md text-on-surface">Virtual Qaraj</h1>
        <p className="mt-1 text-body-md text-on-surface-variant">
          Qarajın tam versiyası — bütün pillələri göstər, yenisini al və VIP nömrə bazarından nömrə seç.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {garageCard}
        {plateMarketCard}
      </div>
    </div>
  );
}
