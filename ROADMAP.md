# ROADMAP

Gələcək istiqamətlər. Buradakılar **hələ icra olunmur** — sadəcə qərara alınmış planlardır. Aktivləşənə qədər heç bir kod bu istiqamətə görə refaktor edilməməlidir.

## VPS-ə tam köçürmə (gələcək, indi YOX)

**Qərar tarixi:** 2026-07-24
**Status:** Planlaşdırılıb, başlanmayıb. Cari yanaşma (Vercel + Supabase) qalır.

Bütün layihə Vercel + Supabase-dən çıxarılıb self-hosted VPS-ə köçürüləcək:

- VPS icarəsi (~$10/ay)
- PostgreSQL birbaşa həmin serverdə işləyəcək (Supabase managed Postgres əvəzinə)
- Google login də ora daşınacaq (Supabase Auth-dan çıxış)
- Domain daxil olmaqla ~$15/ay ümumi

**Motivasiya:**
- Aylıq baxımdan Vercel Pro + Supabase Pro-dan ucuz
- Vercel Hobby-nin 12 Serverless Function limitini aradan qaldırır (bax: `CLAUDE.md` → Deployment)
- Embeddings/LLM-i öz serverində platforma limitləri olmadan işlətmək imkanı — gələcəkdə LLM xərcini azaltmaq üçün qapı

**Köçürmə zamanı nəzərə alınmalı olan əsas risklər:**

1. **Ən çətin hissə Postgres deyil, Supabase Auth-dan çıxmaqdır.** pgvector self-hosted Postgres-də problemsiz qurulur. Amma:
   - Google OAuth axını yenidən qurulmalıdır
   - Bütün RLS siyasətləri `auth.uid()`-ə söykənir (`supabase/migrations/0002_rls_policies.sql` + coin/kurs siyasətləri) — auth həlli dəyişəndə bunlar yenidən implement olunmalıdır
   - Supabase Storage bucket-ları (sənəd yükləmə) da köçürülməlidir
2. **VPS = əməliyyat məsuliyyəti səndədir:** backup, təhlükəsizlik yeniləmələri, uptime artıq öz üzərinə düşür (Vercel/Supabase bunları avtomatik edir).
3. **Faydası:** embeddings və LLM-i (hətta lokal model) öz serverində sərbəst işlətmək — Claude API xərcini azaltmaq üçün real seçim yaranır.

## Əlaqəli açıq mövzular

`CLAUDE.md`-də sənədləşdirilmiş, hələ həll olunmamış məsələlər (köçürmədən asılı olmayan):

- Custom SMTP + email təsdiqi (hazırda söndürülüb)
- Per-IP signup limiti və qlobal gündəlik LLM-xərc "circuit breaker"
- Monetizasiya: real rewarded-ad şəbəkəsi inteqrasiyası (hazırda "reklam izlə" yalnız simulyasiyadır — heç bir reklam gəliri yoxdur)
