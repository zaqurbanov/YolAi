import Footer from '@/components/Footer';
import { formatAzDate } from '@/lib/format/date';

export const metadata = {
  title: 'İstifadə Şərtləri',
};

export default function TermsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <section className="px-6 py-16 lg:py-20">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            İstifadə Şərtləri
          </h1>
          <p className="mono-label mt-2 text-on-surface-variant">
            Son yenilənmə: {formatAzDate(new Date())}
          </p>

          <div className="glass-card mt-8 space-y-6 rounded-2xl p-6 text-sm leading-relaxed text-on-surface sm:p-8">
            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold">1. Xidmətin təsviri</h2>
              <p className="text-on-surface-variant">
                Yol Hərəkəti QA, Azərbaycan Yol Hərəkəti Qaydaları ilə bağlı suallara süni zəka
                köməyilə, rəsmi sənədlərə istinad edərək cavab verən bir xidmətdir. Xidmətdən istifadə
                etməklə aşağıdakı şərtləri qəbul etmiş sayılırsınız.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold">2. Hüquqi məsləhət deyil</h2>
              <p className="text-on-surface-variant">
                Bu xidmətin verdiyi cavablar məlumatlandırma məqsədi daşıyır və rəsmi hüquqi məsləhət
                sayılmır. Konkret hüquqi məsələlərdə həmişə səlahiyyətli dövlət qurumu və ya vəkil ilə
                əlaqə saxlamağı tövsiyə edirik. Süni zəka modelləri səhv edə bilər — mühüm qərarlardan
                əvvəl mənbə sənədi özünüz yoxlayın.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold">3. Hesab məsuliyyəti</h2>
              <p className="text-on-surface-variant">
                Hesabınızın təhlükəsizliyinə görə siz məsuliyyət daşıyırsınız. Şifrənizi üçüncü şəxslərlə
                paylaşmayın və hesabınızda şübhəli fəaliyyət gördükdə bizimlə əlaqə saxlayın.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold">4. Düzgün istifadə</h2>
              <p className="text-on-surface-variant">
                Xidməti qanunsuz məqsədlərlə, digər istifadəçilərə zərər vermək üçün və ya sistemin normal
                işini pozacaq şəkildə (məsələn, avtomatlaşdırılmış həddindən artıq sorğu göndərmək)
                istifadə etməməyisiniz xahiş olunur.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold">5. Xidmətin dəyişdirilməsi</h2>
              <p className="text-on-surface-variant">
                Xidməti, o cümlədən istifadə olunan süni zəka modelini, funksionallığını və mövcudluğunu
                əvvəlcədən xəbərdarlıq etmədən dəyişdirmək və ya dayandırmaq hüququnu özümüzdə saxlayırıq.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="font-display text-lg font-semibold">6. Əlaqə</h2>
              <p className="text-on-surface-variant">
                Suallarınız üçün{' '}
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
