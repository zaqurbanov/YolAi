export type FaqSlug = 'privacy' | 'terms' | 'istifade-qaydalari' | 'faq';

export interface FaqSection {
  heading: string;
  body: string[];
}

export interface FaqPageContent {
  slug: FaqSlug;
  metaTitle: string;
  badge?: string;
  title: string;
  description?: string;
  showUpdatedDate?: boolean;
  sections: FaqSection[];
  cta?: { label: string; href: string };
}

export const FAQ_PAGES: Record<FaqSlug, FaqPageContent> = {
  privacy: {
    slug: 'privacy',
    metaTitle: 'Məxfilik Siyasəti',
    title: 'Məxfilik Siyasəti',
    showUpdatedDate: true,
    sections: [
      {
        heading: '1. Hansı məlumatları toplayırıq',
        body: [
          'Hesab yaratdıqda e-poçt ünvanınızı (və ya Google hesabınızla daxil olduqda Google-un verdiyi əsas profil məlumatlarını) saxlayırıq. Söhbət tarixçəniz — yazdığınız suallar və aldığınız cavablar — hesabınıza bağlı şəkildə saxlanılır ki, əvvəlki söhbətlərinizə qayıda biləsiniz.',
        ],
      },
      {
        heading: '2. Məlumatlarınızdan necə istifadə edirik',
        body: [
          'Sualınızı emal etmək üçün mətni süni zəka modelinə (istifadə olunan provider-dən asılı olaraq DeepSeek, Anthropic Claude, Google Gemini və ya OpenRouter üzərindən üçüncü tərəf modellər) göndəririk ki, yol hərəkəti qaydalarına əsaslanan cavab hazırlansın. Sualı sənədlərlə uyğunlaşdırmaq üçün istifadə olunan embedding (mətn oxşarlığı) hesablaması serverimizdə lokal aparılır — bunun üçün heç bir xarici API-yə məlumat göndərilmir.',
        ],
      },
      {
        heading: '3. Kukilər və sessiya',
        body: [
          'Daxil olma vəziyyətinizi yadda saxlamaq üçün zəruri sessiya kukilərindən istifadə edirik (Supabase Auth vasitəsilə). Reklam və ya izləmə məqsədli kuki istifadə etmirik.',
        ],
      },
      {
        heading: '4. Məlumatların paylaşılması',
        body: [
          'Məlumatlarınızı reklam məqsədilə üçüncü tərəflərə satmırıq. Yalnız xidməti işlətmək üçün zəruri olan xidmət təchizatçıları (verilənlər bazası və autentifikasiya üçün Supabase, cavab generasiyası üçün istifadə olunan AI provider) məlumatlara giriş əldə edə bilər.',
        ],
      },
      {
        heading: '5. Məlumatların saxlanması və silinməsi',
        body: [
          'Söhbət tarixçənizi istənilən vaxt hesabınızın Söhbət bölməsindən silə bilərsiniz. Hesabınızı tamamilə silmək istəsəniz, Hesabım səhifəsindəki müvafiq seçimdən istifadə edə və ya bizimlə əlaqə saxlaya bilərsiniz — bu zaman hesabınıza bağlı bütün söhbət və mesaj qeydləri həmişəlik silinir.',
        ],
      },
      {
        heading: '6. Əlaqə',
        body: [
          'Məxfilik siyasəti ilə bağlı suallarınız üçün qurbanovzaur078@gmail.com ünvanına yaza bilərsiniz.',
        ],
      },
    ],
  },
  terms: {
    slug: 'terms',
    metaTitle: 'İstifadə Şərtləri',
    title: 'İstifadə Şərtləri',
    showUpdatedDate: true,
    sections: [
      {
        heading: '1. Xidmətin təsviri',
        body: [
          'Yol Hərəkəti QA, Azərbaycan Yol Hərəkəti Qaydaları ilə bağlı suallara süni zəka köməyilə, rəsmi sənədlərə istinad edərək cavab verən bir xidmətdir. Xidmətdən istifadə etməklə aşağıdakı şərtləri qəbul etmiş sayılırsınız.',
        ],
      },
      {
        heading: '2. Hüquqi məsləhət deyil',
        body: [
          'Bu xidmətin verdiyi cavablar məlumatlandırma məqsədi daşıyır və rəsmi hüquqi məsləhət sayılmır. Konkret hüquqi məsələlərdə həmişə səlahiyyətli dövlət qurumu və ya vəkil ilə əlaqə saxlamağı tövsiyə edirik. Süni zəka modelləri səhv edə bilər — mühüm qərarlardan əvvəl mənbə sənədi özünüz yoxlayın.',
        ],
      },
      {
        heading: '3. Hesab məsuliyyəti',
        body: [
          'Hesabınızın təhlükəsizliyinə görə siz məsuliyyət daşıyırsınız. Şifrənizi üçüncü şəxslərlə paylaşmayın və hesabınızda şübhəli fəaliyyət gördükdə bizimlə əlaqə saxlayın.',
        ],
      },
      {
        heading: '4. Düzgün istifadə',
        body: [
          'Xidməti qanunsuz məqsədlərlə, digər istifadəçilərə zərər vermək üçün və ya sistemin normal işini pozacaq şəkildə (məsələn, avtomatlaşdırılmış həddindən artıq sorğu göndərmək) istifadə etməməyisiniz xahiş olunur.',
        ],
      },
      {
        heading: '5. Xidmətin dəyişdirilməsi',
        body: [
          'Xidməti, o cümlədən istifadə olunan süni zəka modelini, funksionallığını və mövcudluğunu əvvəlcədən xəbərdarlıq etmədən dəyişdirmək və ya dayandırmaq hüququnu özümüzdə saxlayırıq.',
        ],
      },
      {
        heading: '6. Əlaqə',
        body: ['Suallarınız üçün qurbanovzaur078@gmail.com ünvanına yaza bilərsiniz.'],
      },
    ],
  },
  'istifade-qaydalari': {
    slug: 'istifade-qaydalari',
    metaTitle: 'İstifadə Qaydaları',
    badge: 'Bələdçi',
    title: 'İstifadə Qaydaları',
    description:
      'Yol Hərəkəti QA-dan necə istifadə edəcəyinizi — AI köməkçidən sual verməkdən coin qazanmağa qədər — bu səhifədə qısaca izah edirik.',
    sections: [
      {
        heading: '1. AI köməkçi necə cavab verir',
        body: [
          'Sualınızı yazdığınızda, sistem əvvəlcə yüklənmiş rəsmi Yol Hərəkəti Qaydaları sənədləri arasından sualınıza ən uyğun bəndləri tapır və yalnız həmin mətnə əsaslanaraq cavab hazırlayır.',
          'Cavabın sonunda hansı sənədə və maddəyə istinad edildiyi göstərilir — beləcə mənbəni özünüz də yoxlaya bilərsiniz.',
          'Əgər sualınızın birbaşa cavabı mövcud sənədlərdə tapılmırsa, köməkçi bunu uydurmaq əvəzinə açıq şəkildə bildirir və mümkünsə əlaqəli məlumatı təklif edir.',
        ],
      },
      {
        heading: '2. Coin sistemi necə işləyir',
        body: [
          'Hər istifadəçiyə gündəlik pulsuz coin balansı verilir və bu balans 24 saatdan bir avtomatik yenilənir.',
          'AI köməkçiyə hər mesaj göndərdikdə balansınızdan müəyyən miqdarda coin çıxılır.',
          'Naviqasiya panelindəki coin nişanına klikləməklə cari balansınızı və növbəti sıfırlanmaya qalan vaxtı istənilən an görə bilərsiniz — eyni məlumat Hesab səhifəsində də mövcuddur.',
        ],
      },
      {
        heading: '3. Gündəlik viktorina ilə coin qazanın',
        body: [
          'Hesab səhifəsində gündə bir dəfə yol hərəkəti qaydaları ilə bağlı qısa bir sual təqdim olunur.',
          'Suala düzgün cavab verdikdə balansınıza əlavə coin əlavə olunur — gündə yalnız bir cəhd hesablanır, səhv cavab balansınızı azaltmır.',
        ],
      },
      {
        heading: '4. Coin köçürmələri',
        body: [
          'Hesab səhifəsindəki forma vasitəsilə email ünvanı ilə başqa istifadəçiyə coin göndərə bilərsiniz.',
          'Köçürmələrin minimum miqdarı və gündəlik ümumi köçürmə limiti var — bu limitlər Hesab səhifəsindəki formada göstərilir.',
          'Sistem, gündəlik pulsuz balansınızın tamamilə başqasına köçürülməsinin qarşısını almaq üçün əlavə qoruma tətbiq edir, ona görə bütün balansınızı bir anda köçürə bilməyəcəyiniz hallar ola bilər.',
        ],
      },
      {
        heading: '5. Əlavə coin almaq',
        body: [
          'Hazırda Qiymətlər səhifəsi "tezliklə" statusundadır — tezliklə burada əlavə coin paketləri təqdim ediləcək.',
          'Bu funksiya aktiv olana qədər gündəlik pulsuz balans, viktorina mükafatları və istifadəçilər arası köçürmələr coin əldə etməyin yollarıdır.',
        ],
      },
      {
        heading: '6. Kömək lazımdırsa',
        body: [
          'Sual və ya problemləriniz olduqda footer-dəki dəstək ikonasına klikləyərək birbaşa email göndərə bilərsiniz.',
        ],
      },
    ],
    cta: { label: 'AI köməkçidən soruş', href: '/chat' },
  },
  faq: {
    slug: 'faq',
    metaTitle: 'Tez-tez Verilən Suallar',
    badge: 'Suallar',
    title: 'Tez-tez Verilən Suallar',
    description: 'Yol Hərəkəti QA ilə bağlı ən çox soruşulan sualların qısa cavabları.',
    sections: [
      {
        heading: 'AI köməkçinin cavabları nə qədər etibarlıdır?',
        body: [
          'Cavablar yalnız yüklənmiş rəsmi Yol Hərəkəti Qaydaları sənədlərinə əsaslanır və hər cavabın sonunda mənbə maddəyə istinad göstərilir. Sənədlərdə birbaşa cavab tapılmadıqda, köməkçi bunu uydurmaq əvəzinə açıq şəkildə bildirir. Buna baxmayaraq, bu rəsmi hüquqi məsləhət deyil — mühüm qərarlardan əvvəl mənbəni özünüz yoxlayın.',
        ],
      },
      {
        heading: 'Coin balansım necə yenilənir?',
        body: [
          'Hər istifadəçiyə gündəlik pulsuz coin balansı verilir və bu, 24 saatdan bir avtomatik sıfırlanır. Hər mesaj göndərdikdə balansdan müəyyən miqdar çıxılır — cari balansı naviqasiya panelindəki coin nişanından və ya Hesab səhifəsindən izləyə bilərsiniz.',
        ],
      },
      {
        heading: 'Əlavə coin necə qazana bilərəm?',
        body: [
          'Hesab səhifəsindəki gündəlik sualı düzgün cavablandıraraq (gündə bir cəhd, səhv cavab balansı azaltmır), dostlarınızı referral linki ilə dəvət edərək, və ya başqa istifadəçidən coin köçürməsi qəbul edərək əlavə coin qazana bilərsiniz.',
        ],
      },
      {
        heading: 'Coini başqa istifadəçiyə göndərə bilərəmmi?',
        body: [
          'Bəli — Hesab səhifəsindəki formadan, alıcının email ünvanını daxil edərək coin köçürə bilərsiniz. Minimum məbləğ və gündəlik ümumi limit tətbiq olunur, bu limitlər formada göstərilir.',
        ],
      },
      {
        heading: 'Liderlik lövhəsindəki sıralama nəyə görədir?',
        body: [
          'Liderlik lövhəsi tətbiqdə ən aktiv istifadəçiləri (coin xərcləmə həcminə görə) göstərir — bu, hüquqi bilik səviyyəsi ilə bağlı deyil, yalnız fəallığı əks etdirir.',
        ],
      },
      {
        heading: 'Söhbət tarixçəmi silə bilərəmmi?',
        body: [
          'Bəli, istənilən vaxt Söhbət bölməsindən konkret söhbəti silə bilərsiniz. Hesabınızı tam silmək istəsəniz, Hesab səhifəsindəki müvafiq seçimi istifadə edin — bu, hesabınıza bağlı bütün söhbət və mesaj qeydlərini həmişəlik siləcək.',
        ],
      },
      {
        heading: 'Sualım/probleminiz olduqda kiminlə əlaqə saxlamalıyam?',
        body: [
          'Footer-dəki dəstək ikonasına klikləyərək birbaşa qurbanovzaur078@gmail.com ünvanına yaza bilərsiniz.',
        ],
      },
    ],
    cta: { label: 'AI köməkçidən soruş', href: '/chat' },
  },
};

export const FAQ_SLUGS: FaqSlug[] = ['privacy', 'terms', 'istifade-qaydalari', 'faq'];

export function getFaqPage(slug: string): FaqPageContent | undefined {
  return FAQ_PAGES[slug as FaqSlug];
}
