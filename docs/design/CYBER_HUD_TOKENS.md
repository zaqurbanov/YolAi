# "Cyber-Circuit Legal" (3D dizayn) — kart arxa fon rəngi

Bu sənəd yalnız `[data-design='3d']` (yeni dizayn) kartlarının arxa fon rəngi qərarını izləyir.
Mənbə token: `app/globals.css`-də `[data-design='3d'] { --hud-surface: ... }`.

## Cari dəyər (2026-07-28)

```
--hud-surface: rgba(21, 21, 21, 0.6);   /* #151515 @ ~60% opacity (hex alpha 99) */
```

İstifadəçinin sərəncamı ilə təyin olunub: chat menyusunda öz navbarı, altındakı "Yol hərəkəti
qaydaları ilə bağlı sualınızı yazın..." kartı və sual yazma inputu — bunların arxa fonu əvvəlcə
`#1e293b99` idi, `#15151599`-a dəyişdirildi. **Bu tək token bütün 3D dizayndakı kartlara tətbiq
olunur** — chat-a məxsus deyil.

## Tarixçə

| Tarix | Dəyər | Qeyd |
|---|---|---|
| 2026-07-27 | `rgba(30, 32, 32, 0.5)` (`#1e2020` @ 50%) | Stitch "Sarı 3D Redizayn" (`surface-container`) referansına uyğunlaşdırma — əvvəlki demək olar görünməz `rgba(255,255,255,0.03)` tondan keçid. |
| 2026-07-28 | `rgba(21, 21, 21, 0.6)` (`#151515` @ ~60%) | İstifadəçinin birbaşa göstərdiyi hex kod, chat kartlarında müşahidə olunan `#1e293b99`-u əvəz etdi. |

## Bu tokenin toxunduğu yerlər

`--hud-surface` bir dəfə `app/globals.css`-də `[data-design='3d']` bloku daxilində təyin olunur və
aşağıdakı bütün kart/panel siniflərindən istifadə olunur (heç biri öz hex-ini hardcode etmir):

- `.hud-glass` — Ana Səhifə, Coin Qazan, Öyrənmə/Kurs/Mövzu səhifələrindəki bütün `HudFrame`/
  glass-panel kartları.
- `.wheel-hud-card` — Çarx kartı.
- `[data-design='3d'] .chat-hud-shell .glass-panel` / `.glass-card` — Chat-ın öz navbarı, xoş
  gəlmisiniz kartı, mesaj köpükləri, sual yazma inputu (`app/chat/ChatClient.tsx`-də bunların
  hamısı `.glass-panel`/`.glass-card` sinifindən istifadə edir, ayrıca hardcode rəng yoxdur).
- `[data-design='3d'] .oyrenme-hud-courses .glass-card` — Öyrənmə menyusundakı **kurslar kartı**
  (`app/oyrenme/CourseGrid.tsx`, dəyişməz server komponenti — real kurslar/`UnlockCourseCard`
  ödəniş dialoqu toxunulmayıb). `components/design3d/OyrenmePage3D.tsx` `courseSection` prop-unu
  `.oyrenme-hud-courses` sinifli div-ə bükür, chat-dakı eyni skoplama texnikası ilə. Bordur
  `--hud-border` (neytral).
- `[data-design='3d'] .coinqazan-hud-cards .glass-card` / `.glass-panel` — Coin Qazan menyusundakı
  hər kartın (GarageCard, WheelGame, DailyQuestCard, DailyQuizCard, AdWatchCard, ReferralCard,
  WeeklyLeaderboardCard, PlateMarketCard, GamesSection) daxili səthi. Bunlar artıq `HudFrame`
  (`components/design3d/CoinQazanPage3D.tsx`) daxilində qızılı `border-l-4` aksentli xarici çərçivə
  ilə əhatələnib, amma daxili kart özü dəyişməz qalıb — `.coinqazan-hud-cards` onun da bg-sini
  `--hud-surface`-ə, borderini isə **qızılı `--hud-primary`-ə** çevirir ki, xarici çərçivə ilə
  daxili kart eyni HUD panelinin hissəsi kimi görünsün.

- `[data-design='3d'] .account-hud-cards .glass-card` / `.glass-panel` — Hesabım (`/account`)
  səhifəsindəki stateful `components/account/*` uşaqlarının (ProfileForm, SecurityForms,
  TransferCoinsForm, TransferHistoryList, PreferencesCard, PushNotificationOptIn,
  SecurityQuickView) daxili səthi. Bunlar da (Coin Qazan kartları kimi) `HudFrame`
  (`components/design3d/AccountPage3D.tsx`) daxilində qızılı `border-l-4` aksentli xarici
  çərçivə ilə əhatələnib, daxili forma/dialoq özü isə dəyişməz qalıb (server action-lar,
  client state toxunulmayıb) — `.account-hud-cards` bg-sini `--hud-surface`-ə, borderini
  qızılı `--hud-primary`-ə çevirir. **İstisna:** "Təhlükəli zona" kartı (çıxış + hesabı sil)
  bu sinifdən kənardadır — xəbərdarlıq kimi oxunması üçün qırmızı `--hud-red` bordur saxlayır,
  qızılı deyil.

Nəticədə: bu faylda `--hud-surface`-i dəyişmək kifayətdir, heç bir komponent faylına toxunmaq
lazım deyil — dəyişiklik avtomatik bütün yuxarıdakı yerlərə yayılır.

## Toxunulmayan tokenlər

`--hud-surface-glass` (yalnız navbar/sidebar üçün, şəffaf şüşə effekti saxlanılır) və `--hud-bg`/
`--hud-bg-deep`/`--hud-primary` (səhifə fonu və qızılı vurğu rəngi) bu dəyişiklikdən təsirlənməyib
— bax `app/globals.css`, `[data-design='3d']` blokunun daxilindəki şərhlər.
