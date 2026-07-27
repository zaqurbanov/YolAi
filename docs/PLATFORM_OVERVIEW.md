# YOL — Platforma İcmalı

Bu sənəd saytda nə qurulduğunu, hansı biznes məntiqlərinin işlədiyini və hansı sistemlərin
mövcud olduğunu ətraflı təsvir edir. Kod dəyişdikcə köhnəlmə riski var — dəqiq detal üçün həmişə
`CLAUDE.md` və faktiki koda istinad et, bu sənəd "böyük mənzərəni" görmək üçündür.

**2026-07-27 əlavəsi — bu tarixdən sonra qurulan yeni sistemlər** (bu sənədin əsas hissəsi
2026-07-26-da yazılıb, aşağıdakılar sonradan əlavə olundu, hələ hamısı Supabase-də tətbiq
olunmayıb — bax `docs/VIRTUAL_QARAJ_ROADMAP.md`-in status cədvəlinə):
- **Gündəlik Missiyalar + Günün Sandığı** (`0081_daily_quests.sql`) — 3 gündəlik tapşırıq
  (chat, oyun, dərs), tamamlananda animasiyalı sandıq açılışı, admin-tənzimlənən mükafat.
- **Sınaq İmtahanı** (`0082_exam_simulator.sql`) — 15 dəq/10 sual, bütün mövzular qarışıq, 100
  coin/1 enerji girişi, tam sink (mükafatsız), nəticə `/share/[token]` ilə paylaşılır.
- **Virtual Qaraj** (`0083_virtual_garage.sql`, `0084_vip_plate_market.sql`) — maşın sahibliyi
  (5 pillə), kumulyativ olmayan perklər (XO/enerji/chat bonusu), VIP nömrə bazarı (hər nömrədən
  1 ədəd). Tam yol xəritəsi: `docs/VIRTUAL_QARAJ_ROADMAP.md`.
- **Çarx yenidən qurulması** — bərabər-ehtimallı seçimdən 10-slotlu, admin hər slotun coin
  dəyərini VƏ faizini ayrıca təyin etdiyi çəkili seçimə keçirildi (miqrasiyasız, `lib/coins/wheel.ts`).
- **Admin panel genişlənməsi** — demək olar ki hər coin/enerji mükafatı (gündəlik sual, oyunlar,
  sandıq, qaraj perkləri, VIP nömrə qiyməti) indi `/admin/users`-dən tənzimlənir, SQL-ə ehtiyac yoxdur.
- **Bildiriş və loqlama təkmilləşməsi** — server+client xəta izləmə (`error_logs`, `/admin/logs`),
  admin bütün istifadəçilərə xüsusi mesajlı daxili bildiriş göndərə bilir, zəng ikonu ürək-döyüntülü
  animasiya ilə diqqət çəkir.

---

## 1. Məhsul nədir

Azərbaycan Yol Hərəkəti Qaydaları üzrə **RAG (Retrieval-Augmented Generation) əsaslı AI köməkçi**.
İstifadəçi Azərbaycan dilində sual yazır (və ya şəkil göndərir), sistem yüklənmiş rəsmi sənədlərdən
(PDF-lər) müvafiq hissələri tapır, model bu kontekstə əsaslanaraq **mənbəyə istinadla** cavab verir.
Uydurma (hallüsinasiya) qadağandır — model kontekstdə olmayan heç nə uydurmamalı, tapmadıqda bunu
açıq bildirməlidir (`lib/rag/buildPrompt.ts`).

Bunun ətrafında dörd əlavə "sütun" qurulub ki, istifadəçi təkcə sual-cavab üçün deyil, müntəzəm
qayıtmaq üçün də səbəb tapsın: **sürücülük dərsləri**, **coin iqtisadiyyatı**, **oyunlar/reytinq**.

---

## 2. Əsas sistem: RAG Chat

**Axın:** istifadəçi `/chat`-da sual yazır (və ya kamera/qalereyadan şəkil əlavə edir) →
`app/api/chat/route.ts` → sual embed olunur → `match_chunks` Postgres RPC-si (pgvector cosine
axtarışı + trigram/RRF hibrid skorlama) müvafiq mətn parçalarını (`chunks`) tapır → sistem prompt-u
qurulur (`lib/rag/buildPrompt.ts`) → LLM cavabı stream edir → cavab mənbə sitatları ilə
(`messages.citations`, retrieval nəticələrindən qurulur, modelin öz mətnindən deyil) saxlanılır.

**Şəkil ilə sual (vizual axın):** istifadəçi foto göndərəndə iki mərhələli hibrid iş gedir —
(1) vision model (`lib/rag/identifySignFromImage.ts`) şəkildə görüləni qısa Azərbaycan mətninə
çevirir (maddə nömrəsi göstərmədən, sadəcə "nə görünür"), (2) həmin mətn adi mətn sualı kimi
retrieval borusuna göndərilir. Yüklənən şəkil **DB-də saxlanmır** — yalnız hafizədə emal olunur,
cavab üçün istifadə olunur, səhifə yenilənəndə itir (qəsdən, məxfilik/sadəlik qərarı).

**LLM provayder abstraksiyası:** `lib/llm/index.ts` yeganə yerdir ki, `LLM_PROVIDER` env dəyişəninə
görə OpenRouter (test) və ya Anthropic Claude (prod) arasında keçid edir. Həmçinin Google Gemini-yə
fallback dəstəyi var (OpenRouter-in pulsuz gündəlik limiti bitəndə).

**Embedding sistemi — iki provayder, biri aktiv:**
- **Local (default):** `Xenova/multilingual-e5-small`, 384-ölçülü, serverdə işləyir, xarici API
  lazım deyil.
- **Gemini (opt-in):** `gemini-embedding-001`, 1536-ölçülü, admin panelindən aktivləşdirilir.
- İkisi **paralel sütunlarda** saxlanılır (`chunks.embedding` / `chunks.embedding_gemini`), ingestion
  hər ikisini yazır — beləliklə admin panel keçidi ani olur, yenidən embed lazım deyil.

**Sənəd emalı (ingestion):** admin PDF yükləyir → mətn çıxarılır (`unpdf`) → hüquqi maddələrə görə
parçalanır (`Maddə`/`Fəsil`/`Bölmə` markerləri, ya da uzun mətnlərdə ölçü+overlap) → embed olunur →
DB-yə yazılır. **Kataloq sənədləri** (məs. yol nişanları PDF-i, hüquqi maddə markeri olmayan
"Kod | Təsvir" cədvəl formatlı sənədlər) fərqli strategiya ilə parçalanır — hər nişan öz chunk-u olur.

**Skorlama:** `match_chunks`/`match_chunks_per_document` RPC-ləri vektor + trigram siqnallarını RRF
(Reciprocal Rank Fusion) ilə birləşdirir, diakritiksiz (ə/ı/ş/ç/ğ/ö/ü-siz) yazılan sözləri də tapır
(`az_unaccent`), maddə nömrəsi ilə birbaşa axtarışı sürətləndirən "fast path" var.

---

## 3. Nişan şəkilləri sistemi (yeni, 2026-07-26)

Yol nişanları PDF-i (`public/nisanlar.pdf`) daxilində **242 quraşdırılmış raster şəkil** var —
bunlar avtomatik çıxarılıb kodla (`Kod 1.3` kimi) uyğunlaşdırılır və Supabase Storage-a yüklənir.

- `lib/ingestion/extractSignImages.ts` — PDF-in operator siyahısını (CTM matris izləməsi ilə) gəzərək
  hər şəklin real mövqeyini tapır, ən yaxın kod mətni ilə **koordinat əsaslı** cütləşdirir (sənəd
  sırası ilə cütləşdirmə sınanıb, 9 yerdə səhv çıxıb — buna görə tərk edilib). Asılılıqsız PNG
  kodlayıcı (yalnız Node `zlib`, `sharp`/`canvas` yoxdur).
- Yol **nişanlanması** bölməsi (xətlər, PDF-in sonunda) nişan kodlarını təkrar istifadə etdiyi üçün
  ayrıca `kind: 'marking'` kimi işarələnir və v1-də DB-yə yazılmır (yalnız aşkarlama üçün istifadə
  olunur ki, nişan bölməsi düzgün bitsin).
- `sign_images` cədvəli (miqrasiya `0080`) + `sign-images` public Storage bucket. Yalnız kataloq
  sənədləri ingest olunanda avtomatik işə düşür, mətn ingestini heç vaxt çökdürmür (ayrıca
  fail-safe try/catch).
- **Hələ tətbiq olunmayıb:** vizual təsvirlərin (LLM ilə) çıxarılıb embedding-ə qoşulması və bu
  şəkillərin chat/oyun UI-də göstərilməsi — bunlar planlaşdırılıb, işə salınmayıb.

---

## 4. Coin iqtisadiyyatı

Pulsuz gündəlik AI mesaj limitindən sonra istifadəçi coin xərcləyərək davam edə bilər (`lib/chat/coins.ts`).
Coin qazanmaq yolları (`app/coin-qazan`):

| Mexanizm | Fayl | Qeyd |
|---|---|---|
| Gündəlik sual (quiz) | `lib/coins/quiz.ts` | Səhv cavab da qeydə alınır (attempt itir), cəhd təkrarı ilə fırıldaq önlənir |
| Ardıcıllıq (streak) bonusu | miqrasiya `0064` | Ardıcıl gün sayına görə artan bonus |
| Dost dəvəti (referral) | `lib/coins/referrals.ts` | Yalnız **real istifadə**də (ilk uğurlu mesajda) ödəyir, qeydiyyatda yox — 30 günlük tavan var |
| Reklam izləmə | `lib/coins/adWatch.ts` | Server-verilmiş bir-dəfəlik nonce, server saatı ilə vaxt yoxlanılır |
| Push bildiriş aktivləşdirmə | `lib/coins/pushNotifications.ts` | Endpoint host allowlist yoxlanır + real test push tələb olunur |
| XO oyunu | `lib/coins/games.ts`, `TicTacToeGame.tsx` | Enerji xərcləyir, gündəlik qazanc tavanı var |
| Çarx (Wheel of Fortune) | `lib/coins/wheel.ts`, `WheelGame.tsx` | Gündə bir pulsuz fırlanma |
| Nişan Sürəti (yeni) | `lib/coins/signSpeed.ts`, `signPool.ts`, `SignSpeedGame.tsx` | 10 sualdan ibarət tur, yol nişanı kodu→təsvir seçimi, düzgün cavab başına coin |
| Coin transferi | `lib/coins/transfers.ts` | İstifadəçidən istifadəçiyə, minimum hesab yaşı + gündəlik qəbul tavanı ilə (ferma önləmi) |
| Enerji satın alma | miqrasiya `0072` | Coin sink (coin xərcləyib enerji alma) — gündəlik reset zamanı yığılmır, günə keçmir |

**Abuse-a qarşı ümumi qayda (CLAUDE.md-dən):** email təsdiqi hazırda **deaktivdir** (SMTP
qoşulmayıb), yəni istənilən sayda hesab pulsuz açıla bilər. Ona görə **bütün coin ödəyən yollar
server-tərəfli təsdiqlənir** — heç bir server action client-in göndərdiyi məbləği/indeksi/uyğunluq
bayrağını qəbul etmir, hamısı `app_settings`-dən server-side oxunur.

---

## 5. Oyunlar

`components/games/GamesSection.tsx` altında üç oyun, ortaq **enerji** hovuzu (`user_energy`,
gündəlik reset) ilə:

1. **XO (Tic-Tac-Toe)** — kompüterə qarşı, `settle_tictactoe` RPC-si server-side qrading edir.
2. **Wheel of Fortune (Çarx)** — gündə bir pulsuz fırlanma, mükafat server-side seçilir.
3. **Nişan Sürəti** — 216 real yol nişanı təsvirindən (ingest olunmuş sənəddən, uydurma yox) 10
   sualdan ibarət sürət testi: nişan kodu göstərilir, 4 seçimdən (1 doğru + 3 real distraktor)
   düzgününü seçmək lazımdır. Server sualları + doğru cavabları əvvəlcədən seçir, cavab yalnız
   server-də yoxlanılır, sessiya bir dəfə istifadə oluna bilir (`sign_speed_sessions`).

Bütün oyunlar **fail-closed** — server hər addımı yenidən hesablayır, client-dən gələn məbləğ/hesab
etibar edilmir.

---

## 6. Sürücülük dərsləri (Öyrənmə sistemi)

`app/oyrenme` — kateqoriyalara bölünmüş kurslar, hər mövzunun sonunda test.

- `lib/lessons/` — kurs strukturu (`courses.ts`), AI ilə mövzu təklifi (`aiProposeTopics.ts`,
  `proposeTopics.ts`), mövzu məzmununun AI ilə generasiyası (`generateTopicContent.ts`), böyük
  mövzuların bölünməsi (`splitTopic.ts`).
- `lib/coins/lessonUnlock.ts` / `lessonQuiz.ts` — kursun açılması (unlock) və testin nəticəsinə görə
  coin/irəliləyiş.
- `lib/quiz/topicTest.ts`, `lessons.ts` — mövzu sonu testlərinin sual bankı və qiymətləndirməsi.
- İrəliləyiş izlənilir, istifadəçi hər mövzunu bitirdikcə növbəti kursun açılması coin/test nəticəsi
  ilə şərtlənə bilər.

---

## 7. Reytinq və sosial elementlər

- **Həftəlik liderlik lövhəsi** (`lib/leaderboard/getLeaderboard.ts`, miqrasiya `0065`) — coin
  qazanma fəaliyyətinə görə həftəlik sıralama, `app/leaderboard`.
- **Bildirişlər** (`lib/notifications/`, `app/notifications`) — daxili bildiriş lenti.
- **Push bildirişlər** (`lib/push/broadcast.ts`, `webpush.ts`, `endpointValidation.ts`) — brauzer
  push abunəliyi, admin-dən toplu göndəriş, admin panelindən idarə olunur.
- **Paylaşım** (`app/share/[token]`) — söhbətin ictimai keçidlə paylaşılması.

---

## 8. Autentifikasiya və icazələr (üç qat)

1. **`proxy.ts`** (Next.js 16-da `middleware.ts` əvəzinə) — cookie əsaslı optimistik yoxlama,
   `/chat`, `/admin`, `/account`, `/oyrenme` prefikslərini qoruyur. **DB-yə getmir**, yalnız sürətli
   ilkin filtr.
2. **Route handler/server component səviyyəsi** — `lib/auth/requireAdmin.ts` real admin yoxlaması
   (`profiles.role === 'admin'`) edir. `proxy.ts` heç vaxt admin rolunu təsdiqləmir.
3. **Hər `/api/**` route öz auth yoxlamasını edir** — `proxy.ts` yalnız səhifə prefikslərini qoruyur,
   API route-ları avtomatik qorunmur. (Tarixən `/api/chat` bu səbəbdən açıq qalmışdı — indi düzəldilib.)

`lib/supabase/server.ts`/`client.ts` — RLS-ə tabe olan istifadəçi-səviyyəli client-lər.
`lib/supabase/admin.ts` — service-role, RLS-i keçir, yalnız server-tərəfdə (ingestion, admin
route-ları) istifadə olunur.

---

## 9. Admin panel

`/admin` (`app/admin/[[...slug]]/page.tsx` — tək catch-all route, funksiya büdcəsinə qənaət üçün).
Bölmələr:

| Bölmə | Nə edir |
|---|---|
| `documents` | PDF yükləmə, ingestion statusu, yenidən emal, silmə |
| `kurslar` | Dərs/kurs idarəetməsi |
| `logs` | Sorğu latensiyası + **xəta jurnalı** (bax bölüm 10) |
| `questions` | Admin sualları (FAQ-vari) |
| `quiz` | Gündəlik quiz sualları idarəetməsi |
| `stats` | Ümumi statistika (`lib/admin/getStats.ts`) |
| `users` | İstifadəçi siyahısı/detalı (`lib/admin/getUsers.ts`, `getUserDetail.ts`), embedding
  provayder keçidi burada |
| `busy-phrases` | Chat "yazır..." mərhələ ifadələrinin idarəetməsi |

Admin girişi bütün bölmələrdə təbəqə-təbəqə yoxlanılır (layout + hər bölmənin öz `requireAdmin()`
çağırışı + hər server action-un öz yoxlaması).

---

## 10. Xəta izləmə (loglama) sistemi — yeni, 2026-07-26

Əvvəllər tutulan xətalar yalnız konsola (`console.error`) yazılır, izi qalmırdı. İndi:

- **`lib/logging/logError.ts`** — fail-safe server logger, `error_logs` cədvəlinə yazır (miqrasiya
  `0073`). Heç vaxt özü xəta atmır (loglama xətası əsl xətanı gizlətməməlidir).
- **Server tərəf** — API route-lar, server action-lar, ingestion, retrieval, push və s. daxilində
  onlarla nöqtədə `logError` çağırılır (mövcud `console.error`-a əlavə, əvəzinə yox).
- **Client tərəf** — `app/actions/reportClientError.ts`, auth tələb edən, dəqiqədə 12 yazı ilə
  məhdudlaşan server action. Chat interfeysində (`ChatClient.tsx`) həm `useChat`-in xəta hadisəsinə,
  həm şəkil əlavəetmə rədd yollarına bağlanıb — əvvəllər bu hallar yalnız toast göstərib iz
  buraxmırdı.
- **Admin görünüşü** — `/admin/logs`-da "Xətalar" cədvəli: yer (kontekst açarı), mesaj, açıla bilən
  tam JSON detal, istifadəçi email-i, dəqiq vaxt (Bakı saatı ilə), kontekstə görə filtr.
- **Tapılıb düzəldilmiş yan bug:** admin panelin bütün tarix göstəriciləri server saatına (Vercel-də
  UTC) görə hesablanırdı, Bakı vaxtından 4 saat geri idi — indi hər yerdə məcburi `Asia/Baku` saat
  qurşağı istifadə olunur.

---

## 11. Telefon şəkil yükləmə bug-ı — kök səbəb və düzəliş (2026-07-26)

Chatda telefondan şəkil göndərəndə xəta verirdi. Səbəb: client 5MB-a qədər **xam fayl** ölçüsünə
icazə verirdi, amma şəkil sorğu body-də **base64** kimi göndərilir (~1.37x böyüyür) — 5MB telefon
fotosu ≈ 6.8MB sorğuya çevrilirdi, Vercel-in serverless funksiya body limiti (~4.5MB) aşılırdı.
Düzəliş: şəkil göndərilməzdən əvvəl brauzerdə canvas ilə avtomatik kiçildilir (uzun tərəf ≤1600px,
JPEG keyfiyyəti 0.8), yeni limit 3MB-a endirilib. iPhone-un `HEIC` formatı kimi dekod olunmayan
hallar üçün aydın Azərbaycan dilində xəbərdarlıq var (əvvəllər səssiz uğursuz olurdu).

---

## 12. Deployment məhdudiyyəti (Vercel Hobby)

Vercel-in Hobby planı deployment başına **12 serverless funksiya** ilə məhdudlaşdırır. Real build
31 dinamik route + Proxy istehsal edir — **bu limitin xeyli üstündədir**. Səbəb: kök layout-da
`cookies()` çağıran server komponentlər (NavBar, Sidebar) var, bu bütün səhifələri dinamikləşdirir.
Buna görə:
- **Yeni `route.ts` yaratmaq qadağan kimi rəftar olunur** — mövcud endpoint-lərə `?type=...`
  diskriminatoru əlavə etmək üstünlükdür (`app/api/admin/chat-meta/route.ts` nümunəsi).
- **Server action-lar default seçimdir** yeni funksionallıq üçün — funksiya büdcəsinə əlavə xərc
  gətirmir.
- Real həll **Vercel Pro-ya keçiddir**, konsolidasiya yalnız müvəqqəti tədbirdir.

---

## 13. Hələ qoşulmayan/qəsdən qurulmamış hissələr

- **Monetizasiya (abunəlik/reklam)** — `subscription_plans`/`user_subscriptions` cədvəlləri sxem
  olaraq var, tətbiq kodu yoxdur. `AdSlot.tsx` yalnız `NEXT_PUBLIC_ADS_ENABLED=true` olduqda görünür.
  Bunlar qəsdən toxunulmayıb — istifadəçi ilə razılaşmadan biznes məntiqi yazılmamalıdır.
- **Email təsdiqi** — deaktivdir, custom SMTP (Resend/Brevo/SendGrid) qoşulana qədər.
- **IP-əsaslı qeydiyyat limiti və qlobal LLM xərc dayandırıcısı** — hələ yoxdur, açıq risk kimi
  qeyd olunub.
- **Nişan şəkillərinin vizual təsviri və chat/oyunda göstərilməsi** — infrastruktur (bölüm 3) hazırdır,
  amma LLM ilə təsvir çıxarma və UI inteqrasiyası hələ edilməyib.

---

## 14. Fayl xəritəsi (tez baxış üçün)

```
app/
  (auth)/            — login/signup
  account/           — istifadəçi hesab səhifəsi
  admin/             — admin panel (bax bölüm 9)
  api/
    admin/           — admin API (chat-meta və s., konsolidasiya olunmuş)
    chat/            — əsas RAG chat endpoint-i
    cron/            — planlaşdırılmış işlər (gündəlik xatırlatma və s.)
  auth/callback/     — Supabase auth geri çağırışı
  chat/              — chat UI (ChatClient.tsx əsas komponentdir)
  coin-qazan/        — coin qazanma səhifəsi + server action-lar
  faq/               — tez-tez verilən suallar
  leaderboard/        — həftəlik reytinq
  notifications/      — bildiriş lenti
  oyrenme/            — sürücülük dərsləri/kurslar
  qiymetler/          — qiymət/tarif səhifəsi (əsasən statik)
  share/[token]/       — söhbət paylaşımı
  sual/                — tək sual axını (giriş etmədən?)

lib/
  admin/       — admin data oxumaları
  auth/        — requireAdmin, isAdmin
  chat/        — coin debit, rate limit, paylaşılan söhbət oxuma
  coins/       — bütün coin/oyun/transfer məntiqi
  content/     — kateqoriya məzmunu, ana səhifə fon şəkli
  date/        — Bakı gün sərhədi
  documents/   — sənəd silmə
  embeddings/  — local + Gemini embedding
  format/      — tarix/coin formatlaşdırma (Bakı saat qurşağı ilə)
  ingestion/   — PDF parse, chunk, sign image çıxarışı
  leaderboard/  — reytinq sorğusu
  lessons/      — kurs/mövzu AI generasiyası
  llm/          — provayder abstraksiyası (Anthropic/OpenRouter/Gemini fallback)
  logging/      — server + client xəta jurnalı
  notifications/ — daxili bildiriş
  onboarding/    — tur addımları
  push/          — web push
  quiz/          — gündəlik/mövzu testləri
  rag/           — prompt qurma, rerank, şəkil identifikasiyası
  retrieval/     — pgvector/trigram axtarış
  supabase/      — client/server/admin Supabase client-ləri

supabase/migrations/  — 0001-dən 0080-ə qədər, əl ilə Supabase SQL editorunda tətbiq olunur
```
