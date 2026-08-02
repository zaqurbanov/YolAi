# "Virtual Qaraj" İqtisadiyyatı — Mərhələli Yol Xəritəsi

**Status (2026-07-28):**
- ✅ **Mərhələ 1 — Qaraj təməli** (`car_tiers`/`user_garage`, `purchase_car_tier` RPC, `/coin-qazan`-da Qaraj kartı, admin qiymət nəzarəti) — kod hazır, **Supabase-də tətbiq olunmalı:** `supabase/migrations/0083_virtual_garage.sql`.
- ✅ **Mərhələ 2 — Maşın perkləri** (Lada +10% XO, Prius +5 enerji, G-Class +5 gündəlik mesaj — kumulyativ deyil, admin-tənzimlənən) — kod hazır, miqrasiya lazım deyil (yalnız TS qatı).
- ✅ **Mərhələ 3 — VIP Nömrə Bazarı** (`license_plates`, `purchase_custom_plate`/`claim_free_plate` RPC-ləri, admin moderasiya) — kod hazır, **Supabase-də tətbiq olunmalı:** `supabase/migrations/0084_vip_plate_market.sql`.
- ✅ **Mərhələ 4 — Rəqəmsal Cərimələr və Bərpa İmtahanı** (mövzu testi/imtahan balı `garage_fine_fail_threshold_pct`-dən aşağı düşəndə maşın `user_garage.is_fined` ilə CƏRİMƏLİ olur, perk server-side dayandırılır (`lib/garage/perks.ts`), Leaderboard-da və Qaraj kartında qırmızı möhür göstərilir, 3 sual «Bərpa İmtahanı» ilə (rate-limited) təmizlənir) — kod hazır, **Supabase-də tətbiq olunmalı:** `supabase/migrations/0089_car_fines.sql`.
- ⏳ Mərhələ 5 (Tüninq Easter Egg-i), Mərhələ 6 (Aylıq Baxış) — hələ başlanmayıb.
- 🎁 **Əlaqəli əlavə iş (roadmap-dan kənar, istifadəçi tələbi ilə):** Çarx (Wheel) oyunu bərabər-ehtimallı seçimdən 10-slotlu, admin-tənzimlənən çəkili (faizli) seçimə keçirildi (`lib/coins/wheel.ts`, `WheelPrizesControl.tsx`) — miqrasiya lazım deyil.

**Qeyd:** yuxarıdakı bütün miqrasiyalar (`0082` imtahan simulyatoru daxil olmaqla) hələ Supabase-də əl ilə tətbiq olunmayıb — tətbiq olunana qədər müvafiq funksiyalar "əlçatan deyil" göstərəcək, çökmür.

---

## ⚠️ 2026-08-01 — iki valyutalı iqtisadiyyat bu sənədin əsas fərziyyəsini pozur

`0094_two_currency_economy.sql` coin və enerjini ayırdı (bax `docs/PLATFORM_OVERVIEW.md` § 4).

**Qaraj və VIP nömrələr coin-də qaldı** — bu qəsdən belədir, çünki onlar uzunmüddətli status
məqsədidir və yığılan valyuta buna uyğundur. Mərhələ 1–4-ün kodu dəyişmədi.

**Amma aşağıdakı 1-ci bölmədəki əsas motivasiya cümləsi artıq doğru deyil:**

> ~~"coin qazanmağın yeganə yolu isə qaydaları öyrənmək, AI ilə danışmaq və test həll etməkdir"~~

Yeni modeldə oyun oynamaq və dərs keçmək **enerji** qazandırır, coin yox; rəsmi imtahan isə **coin
sink**-dir (mükafat vermir). Coin gəliri: gündəlik pay (10) + reklam izləmə + həftəlik marafonun
Bazar sandığı + gündəlik-məhdud enerji→coin çevirməsi (`0095`, `0096`), və gələcəkdə coin real
pula satılacaq.

**Nəticə — həll olunmamış dizayn gərginliyi:** "öyrən → maşın al" döngəsi qırılıb. İstifadəçi
qaydaları nə qədər öyrənsə də, bu onu maşına yaxınlaşdırmır; maşın üçün ya günlərlə gözləməli, ya da
coin almalıdır. Bu, monetizasiya baxımından qəsdən ola bilər (maşın = ödənişli status), amma
sənədin 1-ci bölməsindəki "daily habit" məntiqi ilə ziddiyyət təşkil edir. **Mərhələ 5–6-ya
başlamazdan əvvəl həll edilməlidir.** Üç mümkün yol:

1. Qaraj coin-də qalsın, maşın açıq şəkildə **premium/ödənişli status** kimi mövqeləndirilsin.
2. Ucuz tier-lər enerji ilə, bahalı tier-lər coin ilə alınsın (qarışıq model).
3. Öyrənmə/imtahan üçün ayrıca, az miqdarda coin mükafatı geri qaytarılsın — **amma bu, ferma
   səthini yenidən açır** və coin pula bərabər olduğuna görə gündəlik tavan məcburidir.

---

## 1. Strateji xülasə

Hazırkı YOL tətbiqi **utility** formatındadır: istifadəçi lazım olanda gəlir, sual verir/test
həll edir, çıxır. Bu sənəddəki konsepsiya tətbiqi **daily habit** formatına keçirməyi hədəfləyir —
Azərbaycanda avtomobil və nömrə mədəniyyətinin gətirdiyi status/rəqabət hissini oyunlaşdıraraq,
istifadəçini gündəlik geri qaytıran bir "Virtual Qaraj" iqtisadiyyatı qurmaqla.

Əsas fikir düzgündür: **"qayda öyrən" demirik, "bu maşını/nömrəni almaq üçün coin qazan" deyirik**
— coin qazanmağın yeganə yolu isə qaydaları öyrənmək, AI ilə danışmaq və test həll etməkdir.

Bu, tək funksiya deyil — mövcud tətbiqin üstündə demək olar ki **ikinci bir sistemdir** (qaraj,
maşın kataloqu, perklər, nömrə bazarı, cərimə/bərpa dövrü, tüninq, aylıq baxış). Ona görə bu sənəd
tək bir tapşırıq kimi deyil, **6 müstəqil mərhələdən** ibarət yol xəritəsi kimi qurulub — istənilən
mərhələ təkbaşına da sifariş oluna bilər.

---

## 2. Arxitektura prinsipləri (bütün mərhələlərə aiddir)

Bu üç qayda hər mərhələnin dizaynında əvvəlcədən nəzərə alınmalıdır — sonradan "düzəltmək" deyil,
əvvəlcədən qurmaq üçün:

### 2.1 Yeni route yoxdur
Tətbiq artıq Vercel Hobby-nin **12 serverless funksiya** limitini aşıb (kök layout-dakı auth
yoxlaması hər səhifəni dinamikləşdirir). Bu il ərzində qurulan hər yeni funksiya (Gündəlik
Missiyalar, Sınaq İmtahanı) **heç bir yeni `route.ts` və ya səhifə route-u yaratmadan**, mövcud
səhifələrə (`/coin-qazan`, `/account`) kart/tab kimi əlavə olunub. Virtual Qaraj da eyni qaydaya
tabe olmalıdır:
- Qaraj/maşın seçimi → `/coin-qazan` və ya `/account`-da yeni bölmə (yeni route yox).
- Nömrə bazarı → eyni səhifələrdən birinə kart.
- Aylıq "Texniki Baxış" bildirişi → mövcud `app/api/cron/daily-reminder`-ə `?type=...`
  diskriminatoru ilə əlavə olunan yeni bir aylıq cron davranışı (yeni cron route-u yox).

### 2.2 Coin yaradan hər yol server-side tam yoxlanılır
CLAUDE.md-nin "assume accounts are free" qaydası — email təsdiqi deaktiv olduğu üçün istənilən
sayda hesab pulsuz açıla bilər. Bu deməkdir:
- Maşın/nömrə alışı: server balansı yenidən yoxlayır, client-dən heç bir qiymət/id qəbul edilmir
  ("mən bunu aldım" client iddiası deyil, server-side debit).
- Perklər (əlavə coin faizi, əlavə enerji): server-side, mövcud RPC-lərin (`settle_tictactoe`,
  `settle_sign_speed_round` və s.) DAXİLİNDƏ hesablanmalı, client-side "görüntü" kimi deyil.
- Cərimə/bərpa dövrü: kimsə özünü qəsdən cəriməyə salıb dərhal təmizləməklə boş bir "flex" əldə
  edə bilməməlidir (aşağıya, Mərhələ 4-ə bax).

### 2.3 Hüquqi dəqiqlik Easter Egg-də də tələb olunur
Tətbiqin əsas vədi — "yalnız rəsmi sənədlərdən, heç vaxt uydurma" — tüninq bloklama funksiyasına
da aiddir (Mərhələ 5). AI "bu qadağandır, filan maddəyə görə" deyəndə, bu, mövcud RAG borusundan
(retrieval + real sitat) keçməlidir, sərbəst LLM təxmini olmamalıdır. Səhv maddə/cərimə uyduran bir
Easter Egg, tətbiqin bütün etibarlılıq vədini öz daxilində poza bilər.

---

## 3. Mərhələlər

### Mərhələ 1 — Virtual Qaraj təməli (maşın sahibliyi)

**Nə qurulur:** Məhdud sayda maşın pilləsi (məs. Piyada/Velosiped → Lada 2107 → Toyota Prius →
BMW → Mercedes G-Class/Range Rover), hər biri artan coin qiymətilə. Yeni `user_garage` cədvəli
(`user_coins`/`user_energy` ilə eyni RLS/service-role fəlsəfəsində). Leaderboard-da (mövcud
`lib/leaderboard/getLeaderboard.ts`, `app/coin-qazan/leaderboard`) istifadəçinin cari maşını görünür —
yeni istifadəçi başqalarının yanında "G-Class" görüb rəqabət hissi keçirir.

**Asılılıq:** Heç birinə — bu, TƏMƏL mərhələdir, digər 5 mərhələ buna bağlıdır.

**Miqyas:** Orta (yeni cədvəl + RPC + admin idarəetmə + Leaderboard-a inteqrasiya).

**Açıq risk:** Qiymət pilləkəni real coin qazanma sürətinə görə balanslanmalıdır (məs. gündəlik
orta coin qazancı × neçə gün = ən bahalı maşın) — təxminlə deyil, mövcud iqtisadiyyatın real
rəqəmlərinə (`daily_quiz_reward`, `tictactoe_win_reward` və s., artıq admin-tənzimlənən) əsasən
hesablanmalıdır.

### Mərhələ 2 — Maşın perkləri

**Nə qurulur:** Hər pillənin konkret, ölçülə bilən effekti:
- Lada 2107: XO-da +10% **enerji** mükafatı.
- Toyota Prius: daha yüksək gündəlik enerji tavanı (daha çox oyun).
- G-Class/Range Rover: gündəlik əlavə pulsuz AI sualları + Leaderboard-da qızılı vurğu.

**Asılılıq:** Mərhələ 1 (qaraj olmadan perk mənasızdır).

**⚠️ Ziddiyyət (ciddi):** "Limitsiz pulsuz sual" perki mövcud `lib/chat/coins.ts`-in coin-per-mesaj
modelini (gəlir modelinin əsasını) birbaşa zəiflədə bilər. Tövsiyə: "limitsiz" yox, **gündəlik
məhdud əlavə pulsuz sual sayı** (məs. +5, admin-tənzimlənən) — mövcud gündəlik limitə əlavə,
onu ləğv etməyən bir perk.

**Miqyas:** Kiçik-orta (əsasən mövcud RPC-lərə şərti məntiq əlavəsi).

### Mərhələ 3 — VIP Nömrə Bazarı

**Nə qurulur:** Hər istifadəçiyə pulsuz, adi bir nömrə (məs. `77-BC-432`, avtomatik təyin olunur).
İstəyən, böyük coin məbləği ödəyib xüsusi nömrə (`10-AA-001` kimi) ala bilər — hər nömrədən
**yalnız 1 ədəd** ola bilər (unikal, DB-də `unique` constraint ilə qorunur).

**Asılılıq:** Mərhələdən asılı deyil, müstəqil qurula bilər (qarajsız da mənalıdır) — istəsə
Mərhələ 1-dən əvvəl də başlana bilər.

**Açıq suallar (tətbiqdən əvvəl həll olunmalı):**
- İki nəfər eyni nömrəni eyni anda istəyəndə nə olur? (Sadə: ilk uğurlu server-side debit qazanır,
  ikincisi "artıq alınıb" xətası alır — hərrac sistemi YOX, çox mürəkkəbdir v1 üçün.)
- Nömrə köçürülə/satıla bilərmi (istifadəçidən istifadəçiyə)? Yoxsa yalnız ilkin alış?
- Təhqiredici/uyğunsuz nömrələr necə qarşısı alınır? (Admin moderasiya siyahısı və ya server-side
  blacklist filtri lazımdır.)

**Miqyas:** Orta. **Ən yüksək viral/ağızdan-ağıza potensial** — konsepsiyanın ən güclü hissəsi.

### Mərhələ 4 — Rəqəmsal Cərimələr və Bərpa İmtahanı

**Nə qurulur:** İstifadəçi Sınaq İmtahanında/mövzu testində müəyyən həddən çox səhv edəndə,
Leaderboard-dakı maşınına qırmızı "CƏRİMƏLİ" möhürü vurulur, maşın gündəlik bonus coin
gətirmir. Təmizləmək üçün "Cərimə İmtahanı" — AI-ın MƏHZ səhv edilmiş mövzulardan 3 sual verməsi.

**Asılılıq:** Mərhələ 1 (cərimələnəcək maşın olmalıdır) + mövcud `lesson_attempts`/
`sign_speed_sessions`/yeni `exam_sessions` cədvəllərinin səhv cavab məlumatı.

**⚠️ Sui-istifadə riski:** "Hesablar pulsuzdur" fəlsəfəsinə görə, kimsə özünü qəsdən cəriməyə
salıb dərhal bərpa imtahanı ilə "təmizlənmə" döngüsünə girə bilməməlidir (bu, əslində zərərsizdir,
çünki nəticə sadəcə status simvoludur, coin qazandırmır — amma UI/UX-də bu döngünün "əyləncə"
kimi deyil, "yorucu spam" kimi hiss olunmaması üçün gündəlik/həftəlik məhdudiyyət düşünülməlidir).

**Miqyas:** Orta.

### Mərhələ 5 — Qadağan Tüninq Easter Egg-i

**Nə qurulur:** Qaraj daxilində tüninq bölməsi (rəng, disk — coin sink, mükafat yoxdur). Bəzi
seçimlər (qara şüşə plyonkası və s.) klikləndikdə AI dərhal müdaxilə edir: "Bu qadağandır, filan
maddəyə görə, filan cərimə" — VƏ tüninqi ləğv edir.

**Asılılıq:** Mərhələ 1 (qaraj/tüninq UI-si).

**⚠️ Ən çox mühəndislik diqqəti tələb edən hissə:** Bloklama mesajı **mövcud RAG borusundan**
(embedding axtarışı + real sitat, `lib/rag/buildPrompt.ts`-in "yalnız kontekstdən" qaydası ilə)
keçməlidir — statik hardcoded mesaj YOX (uydurma riski, həm də sadəcə bir neçə qadağanı əhatə edər,
genişlənə bilməz). Praktik olaraq: hər "qadağan tüninq" seçimi arxa planda əvvəlcədən müəyyən
edilmiş bir sual kimi işlənir (məs. "ön şüşəyə tündləşdirici plyonka vurmaq qadağandırmı?"),
mövcud retrieval+cavab borusu ilə real sitatlı cavab alınır, UI-də göstərilir. Bu, yeni bir AI
sistemi qurmaq demək deyil — mövcud chat borusunun fərqli bir giriş nöqtəsindən çağırılmasıdır.

**Miqyas:** Kiçik-orta (əsas iş artıq mövcud RAG-in təkrar istifadəsidir), amma diqqətli test tələb
edir (yanlış/qeyri-dəqiq bloklama mesajı ciddi etibarlılıq zərəri vurar).

### Mərhələ 6 — Aylıq "Texniki Baxış" (Retention)

**Nə qurulur:** Ayın müəyyən günü (məs. ayın 1-i) bütün istifadəçilərə bildiriş (mövcud
`lib/push/broadcast.ts` + bu sessiyada qurulan daxili bildiriş sistemi, `lib/notifications/`) —
"Maşınınızın Texniki Baxış vaxtıdır!". Kiçik bir test keçilməzsə, maşının "istismarı" dayanır
(oyunlardan coin qazana bilmir, bərpa üçün testi keçməlidir).

**Asılılıq:** Mərhələ 1 (maşın olmalı ki "istismardan çıxsın"), mövcud cron/bildiriş infrastrukturu.

**Texniki qeyd:** Yeni cron `route.ts` YARADILMIR — mövcud `app/api/cron/daily-reminder`-ə
`?type=monthly-inspection` kimi bir diskriminator əlavə olunur (mövcud "route konsolidasiyası"
konvensiyası, `app/api/admin/chat-meta/route.ts`-in etdiyi kimi).

**Miqyas:** Kiçik-orta. Ən "ucuz" mərhələ — əsasən mövcud infrastrukturun təkrar istifadəsidir.

---

## 4. Ziddiyyət xəritəsi

| Yeni funksiya | Toqquşduğu mövcud sistem | Tövsiyə |
|---|---|---|
| G-Class limitsiz sual perki | `lib/chat/coins.ts` coin-per-mesaj gəlir modeli | Perki **məhdudlaşdır** (gündəlik +N sual), tam əvəz etmə |
| Coin ilə VIP nömrə alışı | Coin hazırda real pulla ALINMIR (monetizasiya bağlıdır, CLAUDE.md) | Bazarın "vaxt/bacarıqla qazanma" əsaslı qalacağını qərarlaşdır — pay-to-win qapısı açılmır |
| Cərimə → bərpa dövrü | "Hesablar pulsuzdur" sui-istifadə fəlsəfəsi | Özünü-cərimələmə/bərpa döngüsünə gündəlik/həftəlik məhdudiyyət |
| Aylıq Texniki Baxış | Mövcud gündəlik cron/bildiriş yükü | Yeni cron route yox, mövcud `daily-reminder`-ə discriminator |
| Qadağan tüninq mesajı | RAG-in "heç vaxt uydurma" tələbi | Statik mesaj yox, real retrieval+sitat borusu |

---

## 5. Tövsiyə olunan sıra

1. **Mərhələ 1 (Qaraj təməli)** — hər şeyin təməli, ilk növbədə.
2. **Mərhələ 3 (VIP Nömrə Bazarı)** — Mərhələ 1-dən müstəqil qurula bilər, ən yüksək viral
   dəyər/miqyas nisbəti — paralel və ya Mərhələ 1-dən dərhal sonra başlana bilər.
3. **Mərhələ 2 (Perklər)** — Mərhələ 1 bitəndən sonra, iqtisadiyyat ziddiyyətini diqqətlə
   həll edərək.
4. **Mərhələ 6 (Aylıq Baxış)** — ucuz, tez qurulur, retention dəyəri dərhal görünür.
5. **Mərhələ 4 (Cərimə/Bərpa)** — orta mürəkkəblik, Mərhələ 1 + mövcud test sistemlərinə bağlı.
6. **Mərhələ 5 (Tüninq Easter Egg-i)** — ən çox diqqət tələb edən, sona saxlanılası (RAG dəqiqliyi
   üçün ən çox test lazımdır).

---

*Bu sənəd bir mühəndislik planı deyil, strateji yol xəritəsidir. Hər mərhələ ayrıca sifariş
ediləndə, o mərhələ üçün ətraflı fayl-səviyyəli tətbiq planı (miqrasiya, RPC, UI) ayrıca
hazırlanacaq — CLAUDE.md-dəki subagent axını (`lead` → `backend`/`frontend`) ilə eyni qaydada.*
