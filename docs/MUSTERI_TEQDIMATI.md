# YOL — Yol Hərəkəti Qaydaları üzrə Süni İntellekt Platforması

### Layihə Təqdimatı

---

## 1. Qısa xülasə

**YOL**, Azərbaycan Yol Hərəkəti Qaydaları üzrə suallara rəsmi sənədlərə əsaslanan, mənbəyə
istinad edən dəqiq cavablar verən süni intellekt platformasıdır. Sadə bir chat-botdan fərqli
olaraq, YOL yalnız yüklənmiş rəsmi qanunvericilik sənədlərindən çıxan məlumatla cavab verir və
uydurma məlumat yaymır — hər cavab konkret maddəyə, sənədə istinad edir.

Platforma tək bir alət deyil, tam bir ekosistemdir: **sual-cavab köməkçisi**, **sürücülük
vəsiqəsi hazırlıq kursları**, **maarifləndirici oyunlar** və **istifadəçi aktivləşdirmə
sistemi** bir yerdə birləşdirilib — məqsəd istifadəçini bir dəfəlik ziyarətçidən müntəzəm
istifadəçiyə çevirməkdir.

---

## 2. Həll etdiyi problem

- Yol hərəkəti qaydaları mürəkkəb, uzun hüquqi mətndir — adi sürücü üçün lazım olan cavabı
  tapmaq vaxt aparır.
- Sürücülük vəsiqəsi imtahanına hazırlaşan namizədlər üçün strukturlaşdırılmış, addım-addım
  material azdır.
- Yol nişanlarının mənasını unutmaq və ya qarışdırmaq geniş yayılmış problemdir.
- İstifadəçiləri platformada saxlamaq (retention) ənənəvi məlumat saytları üçün ən böyük
  çətinlikdir — bir dəfə cavab alan istifadəçi geri qayıtmır.

YOL bunların hamısına bir platformada cavab verir.

---

## 3. Əsas funksiyalar

### 3.1 AI Sual-Cavab Köməkçisi
İstifadəçi Azərbaycan dilində sualını yazır və ya vəziyyətin fotosunu göndərir (məsələn, bir yol
nişanının və ya trafik vəziyyətinin şəkli). Sistem:
- Yüklənmiş rəsmi sənədlər arasından ən uyğun məlumatı tapır,
- Cavabı yalnız bu məlumata əsaslanaraq qurur,
- Hər cavabın yanında konkret maddə/sənəd istinadını göstərir,
- Uyğun məlumat tapılmadıqda bunu açıq bildirir — heç vaxt uydurmur.

Bu, hüquqi/rəsmi məzmun üçün etibarlılığın əsasıdır və platformanın ən böyük fərqləndirici
üstünlüyüdür.

### 3.2 Sürücülük Vəsiqəsi Hazırlıq Kursları
Kateqoriyalara bölünmüş dərslər, hər mövzunun sonunda test. İstifadəçi öz sürətində irəliləyir,
irəliləyişi izlənilir. Süni intellekt yeni mövzu məzmununu da avtomatik generasiya edə bilir —
yəni məzmun bazası genişləndikcə əl əməyi minimuma enir.

### 3.3 Yol Nişanları Kataloqu (vizual)
Rəsmi sənədin daxilində olan 200-dən çox yol nişanının şəkli sistem tərəfindən avtomatik çıxarılıb
kod nömrəsi ilə uyğunlaşdırılır. Bu, həm sual-cavab bölməsində ("bu nişan nə deməkdir?" sualına
vizual cavab), həm də oyun bölməsində istifadə olunur.

### 3.4 Maarifləndirici Oyunlar
- **XO (Tic-Tac-Toe)** — sadə əyləncə, gündəlik aktivlik üçün.
- **Bəxt Çarxı** — gündəlik pulsuz mükafat.
- **Nişan Sürəti** — real yol nişanı məlumatlarına əsaslanan sürətli bilik testi (heç bir uydurma
  sual yoxdur — hər sual rəsmi sənəddən çıxır).

Oyunlar sadəcə əyləncə deyil — istifadəçinin gündəlik geri qayıtması üçün strukturlaşdırılmış
səbəbdir.

### 3.5 Aktivləşdirmə və Mükafat Sistemi
Daxili "sikkə" (coin) iqtisadiyyatı: istifadəçi gündəlik sual həll edərək, ardıcıl gün seriyası
saxlayaraq, dost dəvət edərək və ya oyun oynayaraq sikkə qazanır. Bu sikkələr pulsuz gündəlik AI
sual limitindən sonra əlavə sual hüququ almaq üçün istifadə olunur. Bu mexanizm həm istifadəçini
aktiv saxlayır, həm də gələcəkdə birbaşa monetizasiya modelinə (abunəlik, reklam) əsas yaradır.

### 3.6 Həftəlik Reytinq Lövhəsi
İstifadəçilər aktivliyə görə həftəlik sıralanır — sosial rəqabət elementi əlavə edir, geri
qayıtma tezliyini artırır.

### 3.7 Admin İdarəetmə Paneli
Sənəd yükləmə, məzmun idarəetməsi, istifadəçi idarəetməsi, statistikalar, sistem sağlamlığının
izlənməsi — hamısı ayrıca texniki dəstək olmadan idarə oluna bilən bir panel daxilində.

---

## 4. Etibarlılıq və Təhlükəsizlik

Hüquqi/rəsmi məzmun paylaşan bir platforma üçün doğruluq və təhlükəsizlik ikinci dərəcəli məsələ
deyil, məhsulun özüdür:

- **Uydurma qarşısının alınması** — sistem yalnız yüklənmiş rəsmi sənədlərdən çıxan məlumatla
  cavab verir, sənəddə olmayan heç nəyi "bilmir" kimi göstərmir.
- **Mükafat sistemlərinin sui-istifadəyə qarşı qorunması** — bütün sikkə qazanma yolları
  server tərəfində təsdiqlənir, saxta hesablarla və ya təkrarlanan sorğularla mükafat toplamaq
  qarşısı əvvəlcədən alınıb.
- **Rol əsaslı giriş nəzarəti** — adi istifadəçi, admin səlahiyyətləri aydın ayrılıb, hər həssas
  əməliyyat neçə qat yoxlamadan keçir.
- **Xəta izləmə sistemi** — platformada baş verən istənilən texniki problem avtomatik qeydə
  alınır və admin panelindən izlənilə bilir — problemlər müştəri şikayət etməzdən əvvəl aşkarlana
  bilər.

---

## 5. Texnoloji üstünlüklər (qeyri-texniki dildə)

- **Müasir, sürətli infrastruktur** üzərində qurulub — bulud əsaslı, genişlənə bilən arxitektura.
- **İki AI provayder dəstəyi** — sistem bir süni intellekt xidmətindən asılı deyil, ehtiyac
  olduqda başqasına keçid mümkündür, xidmət kəsilməsi riski azaldılıb.
- **Yerli və bulud əsaslı axtarış texnologiyası** eyni vaxtda dəstəklənir — xərc və performans
  balansı admin tərəfindən seçilə bilir.
- **Mobil uyğun dizayn** — istifadəçi telefon kamerası ilə şəkil göndərə, bildiriş ala, tətbiqi
  ana ekrana quraşdıra bilər (PWA texnologiyası).

---

## 6. Biznes modeli və gəlir potensialı

Platformanın arxitekturası artıq gəlir modelinə hazırdır:

- **Freemium struktur** — pulsuz gündəlik istifadə limiti + sikkə/abunəlik ilə əlavə istifadə.
- **Abunəlik infrastrukturu sxem səviyyəsində hazırdır** — biznes qərarı veriləndə tez tətbiq
  edilə bilər.
- **Reklam inteqrasiyası infrastrukturu** hazırdır — aktivləşdirmə yalnız bir konfiqurasiya
  dəyişikliyi tələb edir.
- **Genişlənmə potensialı** — eyni model başqa ölkələrin yol qaydalarına, ya da başqa hüquqi
  sahələrə (məsələn, vergi qanunvericiliyi, əmək hüququ) tətbiq oluna bilər — arxitektura sənəd
  növünə bağlı deyil.

---

## 7. Nəyə hazırıq, nəyə hazır deyilik (şəffaflıq)

Etibarlı təqdimat üçün açıq demək lazımdır:

**Tam işlək və istifadəyə hazır:**
AI sual-cavab, sənəd yükləmə/idarəetmə, sürücülük dərsləri, üç oyun, sikkə iqtisadiyyatı, dost
dəvəti, həftəlik reytinq, push bildirişlər, admin panel, xəta izləmə sistemi.

**Hazır infrastruktur, biznes qərarı gözləyən:**
Abunəlik/ödəniş sistemi, reklam göstərilməsi — kod səviyyəsində əsas qurulub, aktivləşdirmək üçün
biznes qərarı və konfiqurasiya kifayətdir.

**Planlaşdırılan, hələ işə salınmayan:**
E-poçt təsdiqi (spam-a qarşı əlavə qat), IP əsaslı qeydiyyat məhdudlaşdırılması, yol nişanlarının
vizual axtarışının sual-cavab bölməsinə tam inteqrasiyası.

---

## 8. Nəticə

YOL sadəcə bir "sual-cavab botu" deyil — istifadəçini məlumatlandıran, öyrədən, əyləndirən və
platformada saxlayan tam bir ekosistemdir. Əsası (AI köməkçi, kurslar, oyunlar, mükafat sistemi,
admin idarəetmə) tam işlək vəziyyətdədir; gəlir modelinə keçid isə texniki maneə deyil, sırf
biznes qərarı məsələsidir.

---

*Bu sənəd YOL platformasının funksional imkanlarını ümumi xətlərlə təqdim edir. Texniki
spesifikasiya, demo görüş və ya fərdiləşdirilmiş təklif üçün əlaqə saxlayın.*
