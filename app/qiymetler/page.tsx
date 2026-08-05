import type { Metadata } from 'next';
import Link from 'next/link';
import Footer from '@/components/Footer';
import { ArrowRightIcon, CheckIcon, CloseIcon } from '@/components/icons';
import { createClient } from '@/lib/supabase/server';
import { listActivePackages, type BillingPackage } from '@/lib/billing/packages';
import { getActiveSubscription } from '@/lib/billing/subscriptions';
import { getGlobalDailyCoinGrant } from '@/lib/chat/coins';
import { getGlobalDailyEnergyGrant } from '@/lib/coins/games';
import RequestPlanButton from './RequestPlanButton';

export const metadata: Metadata = {
  title: 'Qiymətlər',
};

// Rendered in the app's EDITORIAL language — the same tree EditorialHome and
// EditorialOyrenme use: `.editorial` scope, max-w-[1280px] rails, the eyebrow →
// navy headline pair, rounded-3xl border-border/40 bg-surface cards, sage/sand
// pills. This page previously used the older glass/HUD vocabulary, which read as
// a different product next to /oyrenme.
//
// No DesignSwitch 3D variant: /qiymetler is a secondary page, and the pages
// without a HUD tree (/sual, /faq, /imtahan) already establish that only the
// primary surfaces carry both trees.

const PILL =
  'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em]';

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-primary">{children}</span>
  );
}

// EVERY CARD RENDERS THE SAME FEATURE ROWS, IN THE SAME ORDER.
//
// That symmetry is the point of a pricing table: the reader compares downward,
// row by row, and a row present on one card but missing from another reads as
// an unanswered question rather than a difference. So the free tier states
// "Reklamlar: var" instead of staying silent about ads.
//
// Values come from the LIVE economy settings and the admin catalog, never from
// constants here — a pricing page that quotes a stale number is worse than one
// that quotes none.
interface PlanFeature {
  label: string;
  value: string;
  /** false renders the muted cross — this plan does not have it. */
  included: boolean;
}

interface PlanCard {
  key: string;
  name: string;
  description: string | null;
  badge: string | null;
  price: string;
  period: string;
  features: PlanFeature[];
  isCurrent: boolean;
  isPaid: boolean;
}

function buildFreeCard(coinFloor: number, energyFloor: number): PlanCard {
  return {
    key: 'free',
    name: 'Pulsuz',
    description: 'Qeydiyyatdan sonra hər gün avtomatik yenilənir.',
    badge: null,
    price: '0',
    period: 'AZN',
    features: [
      { label: 'Gündəlik coin', value: `${coinFloor}`, included: true },
      { label: 'Gündəlik enerji', value: `${energyFloor}`, included: true },
      { label: 'Oyunlarla enerji qazanmaq', value: 'Var', included: true },
      { label: 'Kurslar və imtahan', value: 'Var', included: true },
      { label: 'Reklamlar', value: 'Var', included: false },
      { label: 'Profil rozeti', value: 'Yoxdur', included: false },
    ],
    isCurrent: false,
    isPaid: false,
  };
}

function buildPackageCard(
  pkg: BillingPackage,
  freeCoinFloor: number,
  freeEnergyFloor: number,
  isCurrent: boolean
): PlanCard {
  // A package RAISES the floors and never lowers them (Math.max in
  // lib/coins/dailyGrant.ts). The card must show what a subscriber actually
  // gets, which is the higher of the two — quoting the package's own number
  // when it sits below the free floor would be a lie.
  const coinFloor = Math.max(freeCoinFloor, pkg.coinDailyFloor ?? 0);
  const energyFloor = Math.max(freeEnergyFloor, pkg.energyDailyFloor ?? 0);

  return {
    key: pkg.id,
    name: pkg.name,
    description: pkg.description,
    badge: pkg.badgeLabel,
    price: `${pkg.price}`,
    period: pkg.periodDays ? `AZN / ${pkg.periodDays} gün` : 'AZN',
    features: [
      { label: 'Gündəlik coin', value: `${coinFloor}`, included: true },
      { label: 'Gündəlik enerji', value: `${energyFloor}`, included: true },
      { label: 'Oyunlarla enerji qazanmaq', value: 'Var', included: true },
      { label: 'Kurslar və imtahan', value: 'Var', included: true },
      {
        label: 'Reklamlar',
        value: pkg.adsDisabled ? 'Yoxdur' : 'Var',
        included: pkg.adsDisabled,
      },
      {
        label: 'Profil rozeti',
        value: pkg.badgeLabel ?? 'Yoxdur',
        included: Boolean(pkg.badgeLabel),
      },
    ],
    isCurrent,
    isPaid: true,
  };
}

function FeatureRow({ feature }: { feature: PlanFeature }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-border/40 py-2.5 last:border-b-0">
      <span className="flex min-w-0 items-center gap-2 text-[14px] text-on-surface-variant">
        {feature.included ? (
          <CheckIcon width={14} height={14} className="shrink-0 text-teal-deep" aria-hidden />
        ) : (
          <CloseIcon
            width={14}
            height={14}
            className="shrink-0 text-on-surface-variant/45"
            aria-hidden
          />
        )}
        <span className="truncate">{feature.label}</span>
      </span>
      <span
        className={`shrink-0 text-[14px] font-semibold tabular-nums ${
          feature.included ? 'text-navy' : 'text-on-surface-variant'
        }`}
      >
        {feature.value}
      </span>
    </li>
  );
}

export default async function QiymetlerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Every read fails open to the TS-side default: a pricing page must render
  // even when a settings read hiccups.
  const [packages, subscription, freeCoinFloor, freeEnergyFloor] = await Promise.all([
    listActivePackages(),
    user ? getActiveSubscription(user.id) : Promise.resolve(null),
    getGlobalDailyCoinGrant().catch(() => 3),
    getGlobalDailyEnergyGrant().catch(() => 10),
  ]);

  const subscriptionPackages = packages.filter((p) => p.kind === 'subscription');
  const cards: PlanCard[] = [
    buildFreeCard(freeCoinFloor, freeEnergyFloor),
    ...subscriptionPackages.map((pkg) =>
      buildPackageCard(pkg, freeCoinFloor, freeEnergyFloor, subscription?.packageId === pkg.id)
    ),
  ];

  return (
    <div id="top" className="editorial flex flex-1 flex-col pb-24 md:pb-0">
      {/* Editorial spacing: the large gaps between sections are as much of the
          look as the colours are. Same rail as EditorialHome. */}
      <div className="mx-auto w-full max-w-[1280px] space-y-16 px-6 pt-10 md:space-y-24 md:px-16 md:pt-16">
        <section className="max-w-2xl space-y-4">
          <Eyebrow>{subscription ? 'Abunəniz aktivdir' : 'Planlar'}</Eyebrow>
          <h1 className="text-[32px] font-semibold leading-[1.15] text-navy md:text-[40px]">
            Qiymətlər
          </h1>
          <p className="text-[18px] leading-relaxed text-on-surface-variant">
            {subscription
              ? `${subscription.packageName} — ${new Date(subscription.expiresAt).toLocaleDateString('az-AZ')} tarixinədək aktivdir.`
              : 'Gündəlik coin və enerji həddinizi artırın. Pulsuz istifadə həmişə açıqdır.'}
          </p>
        </section>

        <section>
          {subscriptionPackages.length === 0 ? (
            <div className="rounded-3xl border border-border/40 bg-surface p-8 shadow-sm md:p-12">
              <div className="mx-auto max-w-md text-center">
                <h2 className="text-[20px] font-medium text-navy md:text-[22px]">
                  Planlar hələ hazırlanır
                </h2>
                <p className="mt-2 text-[15px] leading-relaxed text-on-surface-variant">
                  Qiymətləndirmə strukturu üzərində işləyirik. Hazır olduqda planları və gündəlik
                  limitləri burada görəcəksiniz.
                </p>
                <Link
                  href="/chat"
                  className="mt-6 inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-primary transition-[gap] hover:gap-2.5"
                >
                  AI köməkçiyə qayıt
                  <ArrowRightIcon width={13} height={13} aria-hidden />
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-[28px] font-semibold leading-tight text-navy md:text-[40px]">
                Özünüzə uyğun planı seçin.
              </h2>

              <div className="mt-8 grid items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3 md:gap-6">
                {cards.map((card) => (
                  <div
                    key={card.key}
                    className={`flex h-full flex-col rounded-3xl border bg-surface p-6 shadow-sm transition hover:shadow-md ${
                      card.isCurrent ? 'border-primary/50' : 'border-border/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-[20px] font-medium text-navy">{card.name}</h3>
                      {card.isCurrent ? (
                        <span className={`${PILL} shrink-0 bg-sage/40 text-teal-deep`}>Aktiv</span>
                      ) : card.badge ? (
                        <span className={`${PILL} shrink-0 bg-sand/70 text-navy`}>{card.badge}</span>
                      ) : null}
                    </div>

                    {/* Always rendered, with a reserved two-line box, even when a
                        package has no description: otherwise a card without one
                        pulls its price and its whole feature list up by a row,
                        and the columns stop lining up — which is the one thing a
                        comparison table has to get right. Longer text clamps
                        rather than pushing the rows apart. */}
                    <p className="mt-1.5 line-clamp-2 min-h-[2.75rem] text-[14px] leading-relaxed text-on-surface-variant">
                      {card.description}
                    </p>

                    <div className="mt-5 flex items-baseline gap-2">
                      <span className="editorial-display text-[44px] font-bold leading-none text-primary tabular-nums">
                        {card.price}
                      </span>
                      <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-on-surface-variant">
                        {card.period}
                      </span>
                    </div>

                    <ul className="mt-6 flex flex-col">
                      {card.features.map((feature) => (
                        <FeatureRow key={feature.label} feature={feature} />
                      ))}
                    </ul>

                    {/* mt-auto keeps every footer on the same line even when the
                        descriptions differ in length. */}
                    <div className="mt-auto pt-6">
                      {card.isCurrent ? (
                        <span
                          className={`${PILL} w-full justify-center bg-sage/40 py-2.5 text-teal-deep`}
                        >
                          Aktiv plan
                        </span>
                      ) : card.isPaid ? (
                        // No online payment path exists yet, so the CTA opens a
                        // contact form instead of dead-ending: the visitor
                        // leaves an email and phone, the admin calls and grants
                        // the subscription by hand (billing_requests, 0104).
                        <RequestPlanButton
                          packageId={card.key}
                          packageName={card.name}
                          price={`${card.price} ${card.period}`}
                          defaultEmail={user?.email ?? null}
                        />
                      ) : (
                        <Link
                          href="/chat"
                          className="inline-flex w-fit items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-primary transition-[gap] hover:gap-2.5"
                        >
                          İstifadə et
                          <ArrowRightIcon width={13} height={13} aria-hidden />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <p className="mt-8 max-w-3xl text-[14px] leading-relaxed text-on-surface-variant">
                Göstərilən gündəlik miqdar <strong className="text-navy">hər gün avtomatik bərpa
                olunur</strong>: balansınız bu miqdardan azdırsa, ona qədər artırılır. Balansınız
                daha çoxdursa, heç nə silinmir — oyunlarla qazandığınız enerji yerində qalır.
              </p>
            </>
          )}
        </section>
      </div>

      <div className="mt-16">
        <Footer />
      </div>
    </div>
  );
}
