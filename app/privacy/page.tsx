import Footer from '@/components/Footer';
import { formatAzDate } from '@/lib/format/date';

export const metadata = {
  title: 'Məxfilik Siyasəti',
};

export default function PrivacyPage() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Məxfilik Siyasəti
          </h1>
          <p className="mono-label mt-2 text-on-surface-variant">
            Son yenilənmə: {formatAzDate(new Date())}
          </p>

          <div className="glass-card mt-8 space-y-6 rounded-2xl p-6 text-sm leading-relaxed text-on-surface sm:p-8">
            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold">1. Hansı məlumatları toplayırıq</h2>
              <p className="text-on-surface-variant">
                Hesab yaratdıqda e-poçt ünvanınızı (və ya Google hesabınızla daxil olduqda Google-un
                verdiyi əsas profil məlumatlarını) saxlayırıq. Söhbət tarixçəniz — yazdığınız suallar və
                aldığınız cavablar — hesabınıza bağlı şəkildə saxlanılır ki, əvvəlki söhbətlərinizə qayıda
                biləsiniz.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold">2. Məlumatlarınızdan necə istifadə edirik</h2>
              <p className="text-on-surface-variant">
                Sualınızı emal etmək üçün mətni süni zəka modelinə (istifadə olunan provider-dən asılı
                olaraq DeepSeek, Anthropic Claude, Google Gemini və ya OpenRouter üzərindən üçüncü tərəf
                modellər) göndəririk ki, yol hərəkəti qaydalarına əsaslanan cavab hazırlansın. Sualı
                sənədlərlə uyğunlaşdırmaq üçün istifadə olunan embedding (mətn oxşarlığı) hesablaması
                serverimizdə lokal aparılır — bunun üçün heç bir xarici API-yə məlumat göndərilmir.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold">3. Kukilər və sessiya</h2>
              <p className="text-on-surface-variant">
                Daxil olma vəziyyətinizi yadda saxlamaq üçün zəruri sessiya kukilərindən istifadə
                edirik (Supabase Auth vasitəsilə). Reklam və ya izləmə məqsədli kuki istifadə etmirik.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold">4. Məlumatların paylaşılması</h2>
              <p className="text-on-surface-variant">
                Məlumatlarınızı reklam məqsədilə üçüncü tərəflərə satmırıq. Yalnız xidməti işlətmək üçün
                zəruri olan xidmət təchizatçıları (verilənlər bazası və autentifikasiya üçün Supabase,
                cavab generasiyası üçün istifadə olunan AI provider) məlumatlara giriş əldə edə bilər.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold">5. Məlumatların saxlanması və silinməsi</h2>
              <p className="text-on-surface-variant">
                Söhbət tarixçənizi istənilən vaxt hesabınızın Söhbət bölməsindən silə bilərsiniz. Hesabınızı
                tamamilə silmək istəsəniz, Hesabım səhifəsindəki müvafiq seçimdən istifadə edə və ya bizimlə
                əlaqə saxlaya bilərsiniz — bu zaman hesabınıza bağlı bütün söhbət və mesaj qeydləri
                həmişəlik silinir.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold">6. Əlaqə</h2>
              <p className="text-on-surface-variant">
                Məxfilik siyasəti ilə bağlı suallarınız üçün{' '}
                <a href="mailto:qurbanovzaur078@gmail.com" className="text-primary hover:underline">
                  qurbanovzaur078@gmail.com
                </a>{' '}
                ünvanına yaza bilərsiniz.
              </p>
            </section>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
