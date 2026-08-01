# Yol Hərəkəti QA — Layihə haqqında

## Bu nədir?

Azərbaycan **Yol Hərəkəti Qaydaları** üzrə RAG (Retrieval-Augmented Generation) əsaslı süni intellekt çat tətbiqi. Admin komandası rəsmi qaydalar sənədlərini (PDF) yükləyir, sistem onları maddə/fəsil/bölmə səviyyəsində hissələrə bölüb bazaya yazır. İstifadəçilər Azərbaycan dilində sual verir, cavab **yalnız yüklənmiş sənədlərə əsaslanır** və hər cavabda konkret sənəd/maddə/səhifəyə istinad göstərilir. Sistem hallüsinasiyadan qaçmaq üçün sərt qaydalarla qurulub — kontekstdə olmayan heç bir maddə nömrəsi və ya cərimə məbləği uydurulmur; cavab tapılmazsa, bu açıq şəkildə bildirilir.

Tətbiq sadəcə "sual-cavab" deyil — ətrafında sürücülük təhsili (kurslar), gündəlik motivasiya alətləri (coin iqtisadiyyatı, oyunlar, "Virtual Qaraj" avtomobil/nömrə sistemi) və admin idarəetmə paneli qurulub.

## Texnologiya (qısaca)

- **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript
- **Supabase** — Postgres + pgvector (vektor axtarış), auth, storage, RLS
- **HeroUI React v3** — UI komponent kitabxanası
- LLM: OpenRouter (test) və ya Anthropic Claude (prod) — `LLM_PROVIDER` env dəyişəni ilə
- Embeddings: lokal (`multilingual-e5-small`, 384-ölçülü) və ya Google Gemini (1536-ölçülü) — admin panelindən seçilir

## İstifadəçi menyusu (sol sidebar)

| Menyu | Ünvan | Nə üçündür |
|---|---|---|
| Ana Səhifə | `/` | Giriş/başlanğıc səhifəsi |
| Söhbət | `/chat` | AI ilə söhbət — sual ver, sənədə əsaslanan cavab al, söhbət tarixçəsi saxlanılır |
| Sürücülük vəsiqəsini al | `/oyrenme` | Kurslar/dərslər sistemi — mövzu-mövzu öyrənmə, irəliləyiş faizi |
| Coin Qazan | `/coin-qazan` | Coin qazanma mərkəzi (aşağıda ətraflı) |
| Ayarlar | `/account` | Hesab idarəetməsi |

Yalnız giriş etmiş istifadəçilər üçün görünür: **Coin Qazan** və **Ayarlar**. Adminlər Coin Qazan-dan istisna edilib (onlar üçün coin iqtisadiyyatı yoxdur).

### Yuxarı nav-bar (sağ tərəf)

- **Coin qazan** düyməsi (qısayol)
- **Bildirişlər** zəngi (unread sayğacı ilə)
- **Dizayn dəyişdirici** — yeni (3D/HUD) və köhnə (sadə) dizayn arasında keçid, seçim yaddaşda saxlanılır
- **İşıqlı/Qaranlıq tema** keçidi
- **Profil avatarı** → `/account`-a keçid
- **"..." (daha çox)** menyusu — mobil ekranlarda yuxarıdakıların bir hissəsi bura yığılır, həmçinin "Turu yenidən göstər" (onboarding) və "Çıxış" burada yerləşir

### Digər səhifələr (sidebar-da deyil, amma mövcuddur)

| Səhifə | Ünvan | Nə üçündür |
|---|---|---|
| Sual-Cavab | `/sual` | İstifadəçi admin komandasına birbaşa sual göndərə bilər, cavab gələndə bildiriş alır |
| Liderlik lövhəsi | `/leaderboard` | Ən çox aktiv istifadəçilərin sıralanması (motivasiya məqsədli, rəsmi status deyil) |
| Qiymətlər | `/qiymetler` | Hazırda "Tezliklə" vəziyyətində — gələcək ödənişli planlar üçün yer tutucu |
| FAQ | `/faq/[slug]` | Tez-tez verilən suallar |
| Bizə yazın | `/sual` (sidebar-ın altındakı düymə) | Sual-Cavab səhifəsinə qısayol |
| Paylaşım | `/share/[token]` | Söhbətin paylaşıla bilən linki |

## Coin Qazan səhifəsi (`/coin-qazan`) — nələr var?

Bu, tətbiqin ən zəngin səhifəsidir. **İki valyuta var** (`0094`-dən sonra): **coin** premium
valyutadır və chat mesajlarına, rəsmi imtahana, qaraja və VIP nömrələrə xərclənir; **enerji** isə oyun
valyutasıdır və bütün oyunlara gedir. Enerji coin-ə yalnız gündəlik-məhdud `energy_to_coin` yolu ilə
çevrilir (100 → 1.5, gündəlik tavan) — detallar: `docs/PLATFORM_OVERVIEW.md` § 4.

- **Gündəlik pay** — gündə bir dəfə **10 coin + 10 enerji**
- **Gündəlik test sualı** (quiz) — düzgün cavaba görə **enerji**, səhv cavab da qeydə alınır (növbəti cəhd üçün)
- **Reklam izləmə** — reklama baxıb **coin** qazanmaq (server tərəfindən təsdiqlənən müddət və tək-istifadəlik token ilə qorunur)
- **Gündəlik tapşırıqlar (Daily Quests)** — hər missiya tamamlananda ayrıca **enerji**; **həftəlik marafon** sandığı — **PULSUZ**, hər gün açıla bilər, 7 gün ardıcıl açan **coin** qazanır
- **Referans (dəvət) sistemi** — dostunu dəvət et, o, ilk mesajı göndərəndə **coin** qazanırsan
- **Həftəlik liderlik lövhəsi** kartı
- **Oyunlar** — XO (tic-tac-toe), Çarx (Wheel), Nişan Sürəti — enerji xərcləyir və enerji qazandırır
- **Enerji → Coin çevirici** — 100 enerji ≈ 1.5 coin, gündəlik limitlə (admin dəyişir)
- **Virtual Qaraj** — avtomobil "tier"ləri, aktiv perklər (**coin** ilə alınır)
- **Nömrə bazarı (Plate Market)** — VIP avtomobil nömrələri (**coin** ilə alınır)

Bütün coin/enerji qazanma yolları server tərəfində təsdiqlənir (client heç vaxt məbləğ və ya "doğrudur" bayrağı göndərmir) — hesab yaratmağın pulsuz olduğu mühitdə sui-istifadəyə qarşı qorunma üçün. Coin gələcəkdə real pula satılacağı üçün bu qayda xüsusilə coin verən yollara aiddir.

## Öyrənmə səhifəsi (`/oyrenme`)

Kurslar siyahısı — hər kursun mövzuları (`topic`) var, istifadəçi mövzuları keçdikcə faiz irəliləyişi görünür. Kurs və mövzu səhifələri: `/oyrenme/[courseId]`, `/oyrenme/[courseId]/[topicId]`.

## Admin panel (`/admin`, yalnız `role = 'admin'` üçün)

Tab-lar:

| Tab | Ünvan | Funksiya |
|---|---|---|
| Sənədlər | `/admin/documents` | PDF yükləmə, sənəd idarəetməsi (ingestion pipeline-ı işə salır) |
| İstifadəçilər | `/admin/users` | İstifadəçi idarəetməsi, rol təyini, coin/qaraj/perk idarəetməsi, aktiv embedding modelinin (lokal/Gemini) seçimi |
| Kurslar | `/admin/kurslar` | Kurs/mövzu yaratma və redaktə |
| Suallar | `/admin/questions` | İstifadəçilərin `/sual`-dan göndərdiyi sualların cavablandırılması |
| Test Sualları | `/admin/quiz` | Gündəlik quiz suallarının idarəetməsi |
| Statistika | `/admin/stats` | İstifadə statistikası |
| Loglar | `/admin/logs` | Sistem logları |
| Status cümlələri | `/admin/busy-phrases` | Çatın "yazır..." zamanı göstərdiyi status ifadələrinin idarəetməsi |

## Sual-cavab axını (əsas funksiya)

1. İstifadəçi `/chat`-da sual yazır (mətn və ya şəkil əlavə edə bilər)
2. Sual embedding-ə çevrilir, `match_chunks` funksiyası ilə (vektor + trigram axtarış birləşməsi) uyğun sənəd parçaları tapılır
3. Tapılan parçalar sistem prompt-una əlavə olunur, LLM-ə göndərilir
4. Cavab stream olaraq qaytarılır, hər faktın yanında `[Sənəd: ..., Maddə N, səhifə P]` formatında istinad göstərilir
5. Şəkil göndərilibsə, əvvəlcə görüntü təsvir edilir, sonra eyni axından keçir — YALNIZ şərti dildə ("...pozuntusu ola bilər"), qəti hökm heç vaxt verilmir

## Dizayn variantları

Tətbiqdə **iki tam dizayn** paralel mövcuddur:
- **Yeni (default)** — "Cyber-Circuit Legal" 3D/HUD üslubu (`components/design3d/`)
- **Köhnə** — sadə, "LegalDrive HUD" üslubu

İstifadəçi NavBar-dakı düymə ilə ikisi arasında keçə bilər, seçim cookie-də saxlanılır və bütün səhifələrdə tətbiq olunur.
