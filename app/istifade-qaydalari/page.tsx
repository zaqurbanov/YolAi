import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@heroui/styles';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: 'İstifadə Qaydaları',
};

const SECTIONS = [
  {
    title: '1. AI köməkçi necə cavab verir',
    body: [
      'Sualınızı yazdığınızda, sistem əvvəlcə yüklənmiş rəsmi Yol Hərəkəti Qaydaları sənədləri arasından sualınıza ən uyğun bəndləri tapır və yalnız həmin mətnə əsaslanaraq cavab hazırlayır.',
      'Cavabın sonunda hansı sənədə və maddəyə istinad edildiyi göstərilir — beləcə mənbəni özünüz də yoxlaya bilərsiniz.',
      'Əgər sualınızın birbaşa cavabı mövcud sənədlərdə tapılmırsa, köməkçi bunu uydurmaq əvəzinə açıq şəkildə bildirir və mümkünsə əlaqəli məlumatı təklif edir.',
    ],
  },
  {
    title: '2. Coin sistemi necə işləyir',
    body: [
      'Hər istifadəçiyə gündəlik pulsuz coin balansı verilir və bu balans 24 saatdan bir avtomatik yenilənir.',
      'AI köməkçiyə hər mesaj göndərdikdə balansınızdan müəyyən miqdarda coin çıxılır.',
      'Naviqasiya panelindəki coin nişanına klikləməklə cari balansınızı və növbəti sıfırlanmaya qalan vaxtı istənilən an görə bilərsiniz — eyni məlumat Hesab səhifəsində də mövcuddur.',
    ],
  },
  {
    title: '3. Gündəlik viktorina ilə coin qazanın',
    body: [
      'Hesab səhifəsində gündə bir dəfə yol hərəkəti qaydaları ilə bağlı qısa bir sual təqdim olunur.',
      'Suala düzgün cavab verdikdə balansınıza əlavə coin əlavə olunur — gündə yalnız bir cəhd hesablanır, səhv cavab balansınızı azaltmır.',
    ],
  },
  {
    title: '4. Coin köçürmələri',
    body: [
      'Hesab səhifəsindəki forma vasitəsilə email ünvanı ilə başqa istifadəçiyə coin göndərə bilərsiniz.',
      'Köçürmələrin minimum miqdarı və gündəlik ümumi köçürmə limiti var — bu limitlər Hesab səhifəsindəki formada göstərilir.',
      'Sistem, gündəlik pulsuz balansınızın tamamilə başqasına köçürülməsinin qarşısını almaq üçün əlavə qoruma tətbiq edir, ona görə bütün balansınızı bir anda köçürə bilməyəcəyiniz hallar ola bilər.',
    ],
  },
  {
    title: '5. Əlavə coin almaq',
    body: [
      'Hazırda Qiymətlər səhifəsi "tezliklə" statusundadır — tezliklə burada əlavə coin paketləri təqdim ediləcək.',
      'Bu funksiya aktiv olana qədər gündəlik pulsuz balans, viktorina mükafatları və istifadəçilər arası köçürmələr coin əldə etməyin yollarıdır.',
    ],
  },
  {
    title: '6. Kömək lazımdırsa',
    body: [
      'Sual və ya problemləriniz olduqda footer-dəki dəstək ikonasına klikləyərək birbaşa email göndərə bilərsiniz.',
    ],
  },
];

export default function IstifadeQaydalariPage() {
  return (
    <div id="top" className="flex flex-1 flex-col">
      <section className="relative overflow-hidden px-6 py-16 lg:py-20">
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <span className="mono-label rounded-full bg-primary/15 px-3 py-1 text-primary">
            Bələdçi
          </span>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            İstifadə Qaydaları
          </h1>
          <p className="max-w-xl text-on-surface-variant">
            Yol Hərəkəti QA-dan necə istifadə edəcəyinizi — AI köməkçidən sual verməkdən coin
            qazanmağa qədər — bu səhifədə qısaca izah edirik.
          </p>
        </div>
      </section>

      <section className="px-6 py-8 lg:py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          {SECTIONS.map((section) => (
            <div key={section.title} className="glass-card rounded-2xl p-6 text-sm leading-relaxed sm:p-8">
              <h2 className="font-display text-lg font-semibold text-on-surface">{section.title}</h2>
              <div className="mt-3 space-y-2">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-on-surface-variant">
                    {paragraph}
                  </p>
                ))}
              </div>
            </div>
          ))}

          <div className="flex justify-center pt-2">
            <Link href="/chat" className={buttonVariants({ variant: 'primary', size: 'lg' }) + ' glow-primary'}>
              AI köməkçidən soruş
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
