import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import { buttonVariants } from '@heroui/styles';
import FeatureRail from '@/components/home/FeatureRail';
import Footer from '@/components/Footer';
import {
  ArrowRightIcon,
  CheckIcon,
  DocumentIcon,
  ShieldIcon,
} from '@/components/icons';

export interface EditorialLandingProps {
  featureCards: ReadonlyArray<{
    icon: ComponentType<SVGProps<SVGSVGElement>>;
    title: string;
    desc: string;
    href: string;
    cta: string;
  }>;
  stats: ReadonlyArray<{ value: string; label: string }>;
  formattedDriverCount: string;
  driverInitials: string[];
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-primary">{children}</span>
  );
}

// The three steps of the product, stated once. Deliberately describes what the
// app ACTUALLY does (retrieval-grounded answers, then lessons, then the exam
// simulation) rather than generic marketing verbs — a visitor's first question
// is "what is this", and a vague answer costs the signup.
const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Sualını yaz',
    desc: 'Yol qaydaları ilə bağlı istənilən sualı öz sözlərinlə soruş. Vəziyyətin şəklini də göndərə bilərsən.',
  },
  {
    step: '02',
    title: 'Mənbəli cavab al',
    desc: 'Cavab yüklənmiş rəsmi sənədlərdən qurulur və hansı maddəyə əsaslandığını göstərir.',
  },
  {
    step: '03',
    title: 'Dərsləri keç, imtahana hazırlaş',
    desc: 'Mövzu-mövzu dərsləri oxu, hər dərsin testini ver və rəsmi imtahan formatında özünü sına.',
  },
];

// The five things that set YOL apart from the other traffic-rule apps on the
// market — photo-upload AI chat, a driving-license academy, per-section
// courses, sign games and a real exam simulation. Framed as a spec list ("nə
// var, hara aparır") rather than marketing verbs; each row is its own link.

/**
 * LANDING PAGE — what a visitor who is not signed in sees at `/`.
 *
 * Split out of the former EditorialHome, which rendered the marketing page and
 * the personal dashboard from one component and branched on `isLoggedIn`. That
 * made `/` carry both audiences at once: the page was overloaded, and a
 * stranger had to read past progress meters and a daily quiz to find out what
 * the product even is. The dashboard now lives in EditorialDashboard, rendered
 * at /home.
 *
 * Everything here is PUBLIC data — no session, no per-user reads — which is
 * what lets app/page.tsx stay free of `supabase.auth.getUser()`.
 *
 * Visual language unchanged from the previous home: `.editorial` scope,
 * max-w-[1280px] rail, eyebrow → navy headline pairs, sage/sand tokens.
 */
export default function EditorialLanding({
  featureCards,
  stats,
  formattedDriverCount,
  driverInitials,
}: EditorialLandingProps) {
  // No `pb-24` on the root below, unlike the dashboard: that padding exists to
  // clear the fixed mobile tab bar, and the tab bar no longer renders on `/`
  // (it is an in-app control, and this page is for visitors who are not signed
  // in). Verified live — this route has no fixed bottom element at all, so the
  // reserved strip would only be dead space above the footer.
  return (
    <div id="top" className="editorial flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-[1280px] space-y-16 px-6 pt-10 md:space-y-28 md:px-16 md:pt-16">
        {/* Hero — carried over verbatim from the logged-out branch of the old
            home page, which was already written for exactly this audience. */}
        <section className="grid grid-cols-1 items-center gap-8 md:grid-cols-12">
          <div className="space-y-6 md:col-span-7">
            <Eyebrow>Rəsmi sənədlərə əsaslanan hüquqi AI</Eyebrow>
            <h1 className="text-[36px] font-semibold leading-[1.1] text-navy md:text-[56px]">
              Yol hərəkəti qaydaları, <span className="text-primary">mənbəyi ilə birlikdə</span>.
            </h1>
            <p className="max-w-xl text-[18px] leading-relaxed text-on-surface-variant">
              Sualını yaz — cavabı rəsmi sənədlərə istinadla al. Üstəlik vəsiqə dərslərini keç,
              testləri həll et və imtahana hazırlaş.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/chat"
                className={`${buttonVariants({ variant: 'primary', size: 'lg' })} glow-primary rounded-full`}
              >
                Suala başla
              </Link>
              <Link
                href="/oyrenme"
                className={`${buttonVariants({ variant: 'outline', size: 'lg' })} rounded-full border-navy/25 text-navy hover:bg-navy/5`}
              >
                Dərslərə başla
              </Link>
            </div>
            {driverInitials.length > 0 && (
              <div className="flex items-center gap-3 pt-2">
                <div className="flex -space-x-3">
                  {driverInitials.map((initial, i) => (
                    <span
                      key={i}
                      className="flex size-9 items-center justify-center rounded-full border-2 border-background bg-sage/40 text-[13px] font-bold text-navy"
                    >
                      {initial}
                    </span>
                  ))}
                </div>
                <p className="text-[14px] text-on-surface-variant">
                  <span className="font-bold text-navy">{formattedDriverCount}</span> sürücü artıq
                  istifadə edir
                </p>
              </div>
            )}
          </div>
          <div className="hidden justify-center md:col-span-5 md:flex">
            <div className="editorial-seal flex size-40 items-center justify-center rounded-full shadow-lg">
              <ShieldIcon width={64} height={64} />
            </div>
          </div>
        </section>

        {/* "What is this" — the section the old home never had. A visitor who
            has not signed up cannot see the product, so it has to be described
            here, in the order they ask: what is it, how does it work, why
            trust it, what does it cost. */}
        <section>
          <Eyebrow>Bu nədir</Eyebrow>
          <h2 className="mt-2 max-w-3xl text-[28px] font-semibold leading-tight text-navy md:text-[40px]">
            Yol qaydalarını soruşduğun, öyrəndiyin və imtahana hazırlaşdığın yer.
          </h2>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-on-surface-variant">
            YOL — Azərbaycanın yol hərəkəti qaydaları üzrə süni intellekt köməkçisidir. Cavablar
            uydurulmur: yalnız sistemə yüklənmiş rəsmi sənədlərdən qurulur və hər dəfə hansı
            sənədin hansı hissəsinə əsaslandığı göstərilir.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-3 md:gap-6">
            {HOW_IT_WORKS.map((item) => (
              <div
                key={item.step}
                className="rounded-3xl border border-border/40 bg-surface p-6 shadow-sm"
              >
                <span className="editorial-display text-[32px] font-bold leading-none text-primary tabular-nums">
                  {item.step}
                </span>
                <h3 className="mt-3 text-[19px] font-medium text-navy">{item.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-on-surface-variant">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Trust + price, side by side: the two objections that follow "what
              is it". The trust copy mirrors the actual system rule in
              lib/rag/buildPrompt.ts — the model answers only from retrieved
              context and says so when it cannot. */}
          <div className="mt-6 grid gap-4 md:grid-cols-2 md:gap-6">
            <div className="rounded-3xl border border-border/40 bg-surface p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <DocumentIcon width={18} height={18} className="text-teal-deep" aria-hidden />
                <h3 className="text-[19px] font-medium text-navy">Niyə etibar etmək olar</h3>
              </div>
              <ul className="mt-4 space-y-2.5">
                {[
                  'Cavablar yalnız yüklənmiş rəsmi sənədlərdən qurulur',
                  'Hər cavabda hansı sənədə və maddəyə istinad edildiyi göstərilir',
                  'Sənəddə cavab yoxdursa, sistem bunu açıq deyir — uydurmur',
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2 text-[15px] text-on-surface-variant">
                    <CheckIcon
                      width={15}
                      height={15}
                      className="mt-1 shrink-0 text-teal-deep"
                      aria-hidden
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col rounded-3xl border border-border/40 bg-surface p-6 shadow-sm">
              <h3 className="text-[19px] font-medium text-navy">Nə qədərə başa gəlir</h3>
              <p className="mt-2 flex-1 text-[15px] leading-relaxed text-on-surface-variant">
                Qeydiyyatdan sonra hər gün pulsuz sual haqqın avtomatik yenilənir. Daha çox
                istifadə etmək istəyənlər üçün abunə planları var.
              </p>
              <Link
                href="/qiymetler"
                className="mt-4 inline-flex w-fit items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-primary transition-[gap] hover:gap-2.5"
              >
                Planlara bax
                <ArrowRightIcon width={13} height={13} aria-hidden />
              </Link>
            </div>
          </div>
        </section>

        {/* Four pillars. */}
        <section>
          <Eyebrow>İmkanlar</Eyebrow>
          <h2 className="mt-2 max-w-2xl text-[28px] font-semibold leading-tight text-navy md:text-[40px]">
            YOL ilə nələr edə bilərsən?
          </h2>
          {/* Rail on mobile, grid on desktop — see FeatureRail. ScrollReveal is
              deliberately NOT used here: a reveal-on-enter transition fights a
              horizontally-scrolled rail (cards off to the right have never
              intersected, so they would sit invisible until scrolled to, which
              defeats the peek that tells you they exist). */}
          <div className="mt-8">
            <FeatureRail>
              {featureCards.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div
                    key={feature.title}
                    className="group flex h-full flex-col gap-3 rounded-3xl border border-border/40 bg-surface p-6 transition hover:shadow-md"
                  >
                    <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon width={22} height={22} aria-hidden />
                    </span>
                    <h3 className="text-[20px] font-medium text-navy">{feature.title}</h3>
                    <p className="flex-1 text-[15px] leading-relaxed text-on-surface-variant">
                      {feature.desc}
                    </p>
                    <Link
                      href={feature.href}
                      className="mt-1 inline-flex w-fit items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-primary transition hover:gap-2.5"
                    >
                      {feature.cta}
                      <ArrowRightIcon width={13} height={13} />
                    </Link>
                  </div>
                );
              })}
            </FeatureRail>
          </div>
        </section>

        {/* Stats — full-bleed navy band. A dark strip between two light sections
            is the editorial rhythm device the export uses for its featured
            block; here it carries the numbers. */}
        <section className="editorial-stats-band rounded-[40px] px-8 py-12 md:px-16 md:py-16">
          <div className="grid gap-10 text-center sm:grid-cols-3">
            {stats.map((stat) => (
              <div key={stat.label}>
                <p className="editorial-display text-[48px] font-bold leading-none text-sand tabular-nums md:text-[56px]">
                  {stat.value}
                </p>
                <p className="mt-2 text-[12px] font-bold uppercase tracking-[0.1em] opacity-60">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </section>

      </div>

      <div className="mt-16">
        <Footer />
      </div>
    </div>
  );
}
