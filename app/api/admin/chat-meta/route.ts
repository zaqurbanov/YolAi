import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUserConversations } from '@/lib/admin/getUserDetail';
import { apiError, notFound, serverError, logApiError } from '@/lib/api/errors';
import { getChatModelId } from '@/lib/llm';
import { ingestDocument, reprocessDocument } from '@/lib/ingestion/ingestDocument';
import { deleteDocuments } from '@/lib/documents/deleteDocuments';
import { isStaleProcessing } from '@/lib/ingestion/staleness';
import { generateQuestionsFromPdf } from '@/lib/quiz/generateQuestionsFromPdf';
import { createDraftQuestions } from '@/lib/admin/quizQuestions';
import { getUnreadCount, getRecentNotifications } from '@/lib/notifications/notifications';
import { GLOBAL_DEFAULT_SETTING_KEY, ENV_DEFAULT_MAX_PER_WINDOW } from '@/lib/chat/rateLimit';
import {
  COIN_PRICE_SETTING_KEY,
  DEFAULT_MESSAGE_PRICE,
  DAILY_COIN_GRANT_SETTING_KEY,
  DEFAULT_DAILY_LIMIT,
} from '@/lib/chat/coins';
import {
  COURSE_UNLOCK_PRICE_KEY,
  DEFAULT_COURSE_UNLOCK_PRICE,
  PASS_THRESHOLD_KEY,
  DEFAULT_PASS_THRESHOLD,
  QUESTIONS_PER_ATTEMPT_KEY,
  DEFAULT_QUESTIONS_PER_ATTEMPT,
  RETRY_COST_KEY,
  DEFAULT_RETRY_COST,
} from '@/lib/coins/lessonUnlock';
import {
  AD_WATCH_REWARD_KEY,
  DEFAULT_AD_WATCH_REWARD,
  AD_WATCH_DAILY_MAX_KEY,
  DEFAULT_AD_WATCH_DAILY_MAX,
} from '@/lib/coins/adWatch';

// Inherited from the folded-in documents/quiz-questions routes: PDF ingestion
// and LLM question extraction over a full PDF are both slow. This applies to
// the whole file, so the cheap settings branches share it — harmless, since
// maxDuration is a ceiling, not a reservation.
export const maxDuration = 300;

const HOME_BACKGROUND_SETTING_KEY = 'home_background_image_url';
const SITE_LOGO_SETTING_KEY = 'site_logo_url';
const PUBLIC_ASSETS_BUCKET = 'public-assets';

// Storage keys must be ASCII-safe; Azerbaijani/Cyrillic/accented filenames
// (e.g. "778-IQ - Avtomobil yolları haqqında.pdf") make Supabase Storage
// reject the key with "Invalid key". The original name is preserved
// separately in documents.title, so it's safe to slug it here.
function slugifyAssetFilename(name: string): string {
  const dotIndex = name.lastIndexOf('.');
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const ext = dotIndex > 0 ? name.slice(dotIndex + 1) : '';

  const slugBase = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  const slugExt = ext.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();

  return slugExt ? `${slugBase || 'file'}.${slugExt}` : slugBase || 'file';
}

// Sane upper bound to reject fat-fingered values (e.g. 9999999) — same
// convention as app/api/admin/users/[id]/rate-limit/route.ts.
const MAX_ALLOWED = 100000;

// Coin price is numeric(10,2) and explicitly allowed to be fractional (e.g.
// 0.5/message) — bounds chosen to reject fat-fingered values while still
// allowing sub-1 prices, unlike MAX_ALLOWED above which is integer-only.
const MAX_ALLOWED_PRICE = 10000;

// Chunk-listing pagination for `?type=documents&id=...&chunks=1`.
const DEFAULT_CHUNK_PAGE_SIZE = 25;
const MAX_CHUNK_PAGE_SIZE = 100;

const DEFAULT_USER_CONVERSATIONS_LIMIT = 10;
const MAX_USER_CONVERSATIONS_LIMIT = 50;

// Only the two real role tiers are assignable through this API.
const ASSIGNABLE_ROLES = new Set(['admin', 'user']);

// Coin values are numeric(10,2) and explicitly allowed to be fractional
// (e.g. 0.5 grant) — bounds chosen only to reject fat-fingered input.
const MAX_ALLOWED_DAILY_COIN_LIMIT = 100000;
const MAX_ALLOWED_COIN_GRANT = 100000;

// The lesson/ad economy tunables, exposed through one `?type=lesson-economy`
// branch rather than one type discriminator each — the Vercel Hobby
// serverless-function budget (see CLAUDE.md) rules out new route files, and
// these are always edited together on one admin screen.
//
// Retargeted to the COURSE model (0060_lesson_courses.sql). The old
// category-era keys (lesson_category_unlock_price, lesson_completion_bonus,
// lesson_free_category_count) are no longer read anywhere; a stale row for one
// of them in a deployed environment is inert.
//
// `param` is the request/response key the frontend uses; `key` is the
// app_settings row. Bounds are enforced HERE, server-side — the admin UI's
// input constraints are a convenience, not a validation.
const LESSON_ECONOMY_FIELDS = [
  {
    // The GLOBAL default course price. A lesson_courses.unlock_price override
    // wins over this per course, and is edited on the course itself.
    param: 'courseUnlockPrice',
    key: COURSE_UNLOCK_PRICE_KEY,
    defaultValue: DEFAULT_COURSE_UNLOCK_PRICE,
    integerOnly: false,
    min: 0.01,
    max: MAX_ALLOWED_PRICE,
  },
  {
    // Correct answers required to pass a topic test. Nothing here stops it
    // being set above questionsPerAttempt (the two are separate writes);
    // getTopicTestConfig() clamps at READ time so a bad combination can't
    // make every topic unpassable.
    param: 'topicPassThreshold',
    key: PASS_THRESHOLD_KEY,
    defaultValue: DEFAULT_PASS_THRESHOLD,
    integerOnly: true,
    min: 1,
    max: 100,
  },
  {
    // Questions drawn per attempt from the topic's 15-20 question pool.
    param: 'topicQuestionsPerAttempt',
    key: QUESTIONS_PER_ATTEMPT_KEY,
    defaultValue: DEFAULT_QUESTIONS_PER_ATTEMPT,
    integerOnly: true,
    min: 1,
    max: 100,
  },
  {
    param: 'lessonRetryCost',
    key: RETRY_COST_KEY,
    defaultValue: DEFAULT_RETRY_COST,
    integerOnly: false,
    min: 0.01,
    max: MAX_ALLOWED_PRICE,
  },
  {
    param: 'adWatchReward',
    key: AD_WATCH_REWARD_KEY,
    defaultValue: DEFAULT_AD_WATCH_REWARD,
    integerOnly: false,
    min: 0.01,
    max: MAX_ALLOWED_PRICE,
  },
  {
    param: 'adWatchDailyMax',
    key: AD_WATCH_DAILY_MAX_KEY,
    defaultValue: DEFAULT_AD_WATCH_DAILY_MAX,
    integerOnly: true,
    min: 1,
    max: 1000,
  },
] as const;

type LessonEconomyField = (typeof LESSON_ECONOMY_FIELDS)[number];

const LESSON_ECONOMY_KEYS = LESSON_ECONOMY_FIELDS.map((f) => f.key);

function isValidLessonEconomyValue(field: LessonEconomyField, value: number): boolean {
  if (!Number.isFinite(value)) return false;
  if (field.integerOnly && !Number.isInteger(value)) return false;
  return value >= field.min && value <= field.max;
}

const BUSY_PHRASE_STAGES = ['analyzing', 'rewriting', 'searching', 'finalizing', 'streaming'] as const;
type BusyPhraseStage = (typeof BUSY_PHRASE_STAGES)[number];

function isBusyPhraseStage(value: unknown): value is BusyPhraseStage {
  return typeof value === 'string' && (BUSY_PHRASE_STAGES as readonly string[]).includes(value);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  // busy-phrases must be readable by any authenticated user (the chat page
  // itself fetches these, not just admins) — so this branch is handled
  // before the requireAdmin() gate below, via the user-scoped client so
  // normal RLS (chat_busy_phrases_select_authenticated, 0046) governs access.
  if (type === 'busy-phrases') {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('chat_busy_phrases')
      .select('id, stage, phrase, display_order')
      .order('stage', { ascending: true })
      .order('display_order', { ascending: true });

    if (error) return serverError(error, 'Status cümlələrini yükləmək uğursuz oldu');

    return NextResponse.json({ phrases: data ?? [] });
  }

  // Like busy-phrases above, this must be readable by anyone hitting the
  // public home page, not just admins — handled before the requireAdmin()
  // gate. app_settings has no anon-readable RLS policy (0024), so this uses
  // the service-role client the same way rate-limit/coin-price/
  // daily-coin-grant do below, just without the admin gate first.
  if (type === 'background-image') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', HOME_BACKGROUND_SETTING_KEY)
      .maybeSingle();

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const url = typeof data?.value === 'string' ? data.value : null;
    return NextResponse.json({ url });
  }

  // Same public, no-admin-gate rationale as background-image above — the
  // site logo is rendered in NavBar/Sidebar for all visitors, not just admins.
  if (type === 'logo') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', SITE_LOGO_SETTING_KEY)
      .maybeSingle();

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const url = typeof data?.value === 'string' ? data.value : null;
    return NextResponse.json({ url });
  }

  // Everything NavBar/Sidebar used to read server-side, in one public,
  // no-admin-gate branch. Those two are client components now (so the ROOT
  // layout no longer calls cookies() and auth-free pages can render static —
  // see components/useNavState.ts); this exists instead of a new
  // app/api/nav-state/route.ts because the Vercel Hobby function budget in
  // CLAUDE.md rules out new route files. Rendering-only data: the real admin
  // gate is still requireAdmin() on the admin routes/pages themselves.
  if (type === 'nav-state') {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const admin = createAdminClient();
    const { data: logoRow } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', SITE_LOGO_SETTING_KEY)
      .maybeSingle();
    const logoUrl = typeof logoRow?.value === 'string' ? logoRow.value : null;

    if (!user) {
      return NextResponse.json({ user: null, isAdmin: false, logoUrl, unreadCount: 0, notifications: [] });
    }

    const [{ data: profile }, unreadCount, notifications] = await Promise.all([
      supabase.from('profiles').select('role, full_name, avatar_url').eq('id', user.id).single(),
      getUnreadCount(user.id),
      getRecentNotifications(user.id),
    ]);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email ?? null,
        fullName: profile?.full_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
      },
      isAdmin: profile?.role === 'admin',
      logoUrl,
      unreadCount,
      notifications,
    });
  }

  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  if (type === 'model') {
    return NextResponse.json({ modelId: getChatModelId() });
  }

  // Folded in from app/api/admin/documents/route.ts (Vercel Hobby function
  // budget, see CLAUDE.md). Service-role client, legitimate only because
  // requireAdmin() above has already gated this handler.
  if (type === 'documents') {
    const id = searchParams.get('id');
    const supabase = createAdminClient();

    if (id) {
      if (searchParams.get('chunks') === '1') {
        const { data: document, error: fetchError } = await supabase
          .from('documents')
          .select('id')
          .eq('id', id)
          .single();
        if (fetchError || !document) {
          return notFound('Sənəd tapılmadı');
        }

        const page = Math.max(1, Number(searchParams.get('page')) || 1);
        const pageSize = Math.min(
          MAX_CHUNK_PAGE_SIZE,
          Math.max(1, Number(searchParams.get('pageSize')) || DEFAULT_CHUNK_PAGE_SIZE)
        );
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const {
          data: chunks,
          error,
          count,
        } = await supabase
          .from('chunks')
          .select('id, content, page_number, article_label, chunk_index', { count: 'exact' })
          .eq('document_id', id)
          .order('chunk_index', { ascending: true })
          .range(from, to);

        if (error) return serverError(error, 'Chunk-ları yükləmək uğursuz oldu');

        return NextResponse.json({ chunks, total: count ?? 0, page, pageSize });
      }

      const { data: document, error: fetchError } = await supabase
        .from('documents')
        .select('id, title, status, page_count, error_message, created_at, updated_at')
        .eq('id', id)
        .single();
      if (fetchError || !document) {
        return notFound('Sənəd tapılmadı');
      }
      const documentWithStale = { ...document, stale: isStaleProcessing(document.status, document.updated_at) };

      // Pull content length + article_label per chunk (not the embedding column,
      // which is large and unused here) to derive split-strategy stats in-process
      // rather than adding a bespoke SQL aggregate for a one-off admin view.
      const { data: chunkRows, error: chunksError } = await supabase
        .from('chunks')
        .select('content, article_label')
        .eq('document_id', id);
      if (chunksError) return serverError(chunksError, 'Chunk statistikasını yükləmək uğursuz oldu');

      const total = chunkRows.length;
      let minLength = 0;
      let maxLength = 0;
      let avgLength = 0;
      let markerBased = 0;
      let fallback = 0;

      if (total > 0) {
        const lengths = chunkRows.map((c) => c.content?.length ?? 0);
        minLength = Math.min(...lengths);
        maxLength = Math.max(...lengths);
        avgLength = Math.round(lengths.reduce((sum, len) => sum + len, 0) / total);
        for (const c of chunkRows) {
          if (c.article_label !== null) markerBased += 1;
          else fallback += 1;
        }
      }

      return NextResponse.json({
        document: documentWithStale,
        chunkStats: { total, minLength, maxLength, avgLength, markerBased, fallback },
      });
    }

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return serverError(error, 'Sənədləri yükləmək uğursuz oldu');
    const documents = data.map((doc) => ({
      ...doc,
      stale: isStaleProcessing(doc.status, doc.updated_at),
    }));
    return NextResponse.json({ documents });
  }

  if (type === 'user') {
    const id = searchParams.get('id');
    if (!id) return apiError(400, 'id tələb olunur');

    const limit = Math.min(
      MAX_USER_CONVERSATIONS_LIMIT,
      Math.max(1, Number(searchParams.get('limit')) || DEFAULT_USER_CONVERSATIONS_LIMIT)
    );
    const offset = Math.max(0, Number(searchParams.get('offset')) || 0);

    try {
      const page = await getAdminUserConversations(id, { limit, offset });
      return NextResponse.json(page);
    } catch (error) {
      return serverError(error, 'Söhbət tarixçəsini yükləmək uğursuz oldu');
    }
  }

  if (type === 'log') {
    const messageId = searchParams.get('messageId');
    if (!messageId) return apiError(400, 'messageId parametri tələb olunur');

    // User-scoped client, not createAdminClient() — the existing
    // chat_request_logs_select_admin RLS policy (0007) already permits admin
    // SELECT, so service-role is unnecessary here on top of requireAdmin().
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('chat_request_logs')
      .select(
        'rewrite_ms, embed_ms, db_search_ms, llm_first_token_ms, llm_total_ms, used_fallback, model_used, created_at, prompt_tokens, completion_tokens, total_tokens',
      )
      .eq('message_id', messageId)
      .maybeSingle();

    if (error) return serverError(error, 'Vaxt ölçmələrini yükləmək uğursuz oldu');

    // No matching row is an expected, non-error case (messages created before
    // this feature shipped, or a best-effort log insert that failed) — return
    // 200 with `log: null` rather than 404, so the frontend doesn't need to
    // special-case a "missing resource" status for what's normal, not broken.
    return NextResponse.json({ log: data ?? null });
  }

  if (type === 'rate-limit') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', GLOBAL_DEFAULT_SETTING_KEY)
      .maybeSingle();

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const tableValue = data ? Number(data.value) : null;
    const isTableConfigured = tableValue !== null && Number.isFinite(tableValue) && tableValue > 0;

    return NextResponse.json({
      maxPerDay: isTableConfigured ? tableValue : ENV_DEFAULT_MAX_PER_WINDOW,
      source: isTableConfigured ? 'table' : 'env',
    });
  }

  if (type === 'coin-price') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', COIN_PRICE_SETTING_KEY)
      .maybeSingle();

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const tableValue = data ? Number(data.value) : null;
    const isTableConfigured = tableValue !== null && Number.isFinite(tableValue) && tableValue > 0;

    return NextResponse.json({
      price: isTableConfigured ? tableValue : DEFAULT_MESSAGE_PRICE,
      source: isTableConfigured ? 'table' : 'default',
    });
  }

  if (type === 'daily-coin-grant') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', DAILY_COIN_GRANT_SETTING_KEY)
      .maybeSingle();

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const tableValue = data ? Number(data.value) : null;
    const isTableConfigured = tableValue !== null && Number.isFinite(tableValue) && tableValue > 0;

    return NextResponse.json({
      dailyCoinGrant: isTableConfigured ? tableValue : DEFAULT_DAILY_LIMIT,
      source: isTableConfigured ? 'table' : 'default',
    });
  }

  if (type === 'lesson-economy') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('key, value')
      .in('key', LESSON_ECONOMY_KEYS);

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));

    // One object per tunable so the frontend can show "default" vs
    // "admin-configured" per card, same `source` convention as coin-price /
    // daily-coin-grant above.
    const settings = Object.fromEntries(
      LESSON_ECONOMY_FIELDS.map((field) => {
        const raw = byKey.get(field.key);
        const value = raw === undefined || raw === null ? null : Number(raw);
        const isConfigured = value !== null && isValidLessonEconomyValue(field, value);
        return [
          field.param,
          {
            value: isConfigured ? value : field.defaultValue,
            source: isConfigured ? 'table' : 'default',
          },
        ];
      })
    );

    return NextResponse.json({ settings });
  }

  return apiError(400, 'type parametri düzgün deyil');
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type === 'background-image') {
    const formData = await request.formData().catch(() => null);
    const file = formData?.get('file');

    if (!(file instanceof File)) {
      return apiError(400, 'file tələb olunur');
    }
    if (!file.type.startsWith('image/')) {
      return apiError(400, 'Yalnız şəkil faylları qəbul olunur');
    }

    const admin = createAdminClient();
    const storagePath = `home-background/${crypto.randomUUID()}-${slugifyAssetFilename(file.name)}`;

    const { error: uploadError } = await admin.storage
      .from(PUBLIC_ASSETS_BUCKET)
      .upload(storagePath, file, { contentType: file.type });
    if (uploadError) return serverError(uploadError, 'Şəkli yükləmək uğursuz oldu');

    const {
      data: { publicUrl },
    } = admin.storage.from(PUBLIC_ASSETS_BUCKET).getPublicUrl(storagePath);

    const { error } = await admin
      .from('app_settings')
      .upsert({ key: HOME_BACKGROUND_SETTING_KEY, value: publicUrl, updated_at: new Date().toISOString() });
    if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');

    return NextResponse.json({ url: publicUrl });
  }

  if (type === 'logo') {
    const formData = await request.formData().catch(() => null);
    const file = formData?.get('file');

    if (!(file instanceof File)) {
      return apiError(400, 'file tələb olunur');
    }
    if (!file.type.startsWith('image/')) {
      return apiError(400, 'Yalnız şəkil faylları qəbul olunur');
    }

    const admin = createAdminClient();
    const storagePath = `logo/${crypto.randomUUID()}-${slugifyAssetFilename(file.name)}`;

    const { error: uploadError } = await admin.storage
      .from(PUBLIC_ASSETS_BUCKET)
      .upload(storagePath, file, { contentType: file.type });
    if (uploadError) return serverError(uploadError, 'Şəkli yükləmək uğursuz oldu');

    const {
      data: { publicUrl },
    } = admin.storage.from(PUBLIC_ASSETS_BUCKET).getPublicUrl(storagePath);

    const { error } = await admin
      .from('app_settings')
      .upsert({ key: SITE_LOGO_SETTING_KEY, value: publicUrl, updated_at: new Date().toISOString() });
    if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');

    return NextResponse.json({ url: publicUrl });
  }

  // Folded in from app/api/admin/documents/route.ts. Two POST shapes share
  // this branch, exactly as before: `?type=documents&id=...` reindexes an
  // existing document, `?type=documents` with no id is the multipart upload.
  if (type === 'documents') {
    const id = searchParams.get('id');

    if (id) {
      // Unlike ingest-on-upload, this is fully awaited before responding (not a
      // detached background job), so a failure here should be surfaced to the
      // caller rather than returning a false ok:true.
      try {
        await reprocessDocument(id);
      } catch (err) {
        return serverError(err, 'Sənədi yenidən emal etmək uğursuz oldu');
      }

      return NextResponse.json({ ok: true });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const title = formData.get('title');

    if (!(file instanceof File) || typeof title !== 'string' || !title.trim()) {
      return apiError(400, 'file və title tələb olunur');
    }
    if (file.type !== 'application/pdf') {
      return apiError(400, 'Yalnız PDF fayllar qəbul olunur');
    }

    const supabase = createAdminClient();
    const storagePath = `${crypto.randomUUID()}-${slugifyAssetFilename(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, file, { contentType: 'application/pdf' });
    if (uploadError) return serverError(uploadError, 'Faylı yükləmək uğursuz oldu');

    const { data: document, error: insertError } = await supabase
      .from('documents')
      .insert({ title: title.trim(), storage_path: storagePath, uploaded_by: auth.userId })
      .select()
      .single();
    if (insertError) return serverError(insertError, 'Sənəd yaratmaq uğursuz oldu');

    // The document row and upload already succeeded; ingestion progress/failure
    // is tracked via documents.status and surfaced through GET.
    try {
      await ingestDocument(document.id);
    } catch (err) {
      logApiError(`ingest document=${document.id}`, err);
    }

    return NextResponse.json({ document });
  }

  // Folded in from app/api/admin/quiz-questions/route.ts. `category` is
  // accepted but currently unused: the LLM picks a category per question
  // itself (lib/quiz/generateQuestionsFromPdf.ts), this field is reserved for
  // a future "bias toward this category" hint.
  if (type === 'quiz-questions') {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return apiError(400, 'file tələb olunur');
    }
    if (file.type !== 'application/pdf') {
      return apiError(400, 'Yalnız PDF fayllar qəbul olunur');
    }

    let generated;
    try {
      const buffer = await file.arrayBuffer();
      generated = await generateQuestionsFromPdf(buffer);
    } catch (err) {
      logApiError(`generate quiz questions from pdf file=${file.name}`, err);
      return serverError(err, 'Sənəddən suallar hazırlamaq uğursuz oldu');
    }

    if (generated.length === 0) {
      return NextResponse.json({ questions: [] });
    }

    const result = await createDraftQuestions(
      generated.map((q) => ({
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        category: q.category,
        explanation: q.explanation,
        sourceTitle: file.name,
        createdBy: auth.userId,
      }))
    );

    if (!result.ok) return apiError(500, result.error);

    return NextResponse.json({ questions: result.questions });
  }

  if (type !== 'busy-phrases') {
    return apiError(400, 'type parametri düzgün deyil');
  }

  const body = await request.json().catch(() => null);
  const stage = body?.stage;
  const phrase = body?.phrase;
  const displayOrder = body?.display_order ?? 0;

  if (!isBusyPhraseStage(stage)) {
    return apiError(400, `stage aşağıdakılardan biri olmalıdır: ${BUSY_PHRASE_STAGES.join(', ')}`);
  }

  if (typeof phrase !== 'string' || phrase.trim().length === 0) {
    return apiError(400, 'phrase boş ola bilməz');
  }

  if (typeof displayOrder !== 'number' || !Number.isInteger(displayOrder)) {
    return apiError(400, 'display_order tam ədəd olmalıdır');
  }

  const { data, error } = await createAdminClient()
    .from('chat_busy_phrases')
    .insert({ stage, phrase: phrase.trim(), display_order: displayOrder })
    .select('id, stage, phrase, display_order')
    .single();

  if (error) return serverError(error, 'Status cümləsini yaratmaq uğursuz oldu');

  return NextResponse.json({ phrase: data });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type === 'busy-phrases') {
    const body = await request.json().catch(() => null);
    const id = body?.id;

    if (typeof id !== 'string' || id.trim().length === 0) {
      return apiError(400, 'id tələb olunur');
    }

    const update: Record<string, unknown> = {};

    if (body?.stage !== undefined) {
      if (!isBusyPhraseStage(body.stage)) {
        return apiError(400, `stage aşağıdakılardan biri olmalıdır: ${BUSY_PHRASE_STAGES.join(', ')}`);
      }
      update.stage = body.stage;
    }

    if (body?.phrase !== undefined) {
      if (typeof body.phrase !== 'string' || body.phrase.trim().length === 0) {
        return apiError(400, 'phrase boş ola bilməz');
      }
      update.phrase = body.phrase.trim();
    }

    if (body?.display_order !== undefined) {
      if (typeof body.display_order !== 'number' || !Number.isInteger(body.display_order)) {
        return apiError(400, 'display_order tam ədəd olmalıdır');
      }
      update.display_order = body.display_order;
    }

    if (Object.keys(update).length === 0) {
      return apiError(400, 'Yeniləmək üçün heç olmasa bir sahə tələb olunur');
    }

    update.updated_at = new Date().toISOString();

    const { data, error } = await createAdminClient()
      .from('chat_busy_phrases')
      .update(update)
      .eq('id', id)
      .select('id, stage, phrase, display_order')
      .single();

    if (error) return serverError(error, 'Status cümləsini yeniləmək uğursuz oldu');

    return NextResponse.json({ phrase: data });
  }

  // Folded in from app/api/admin/documents/route.ts — rename a document.
  if (type === 'documents') {
    const id = searchParams.get('id');
    if (!id) return apiError(400, 'id tələb olunur');

    const body = await request.json().catch(() => null);
    const title = body?.title;

    if (typeof title !== 'string' || !title.trim()) {
      return apiError(400, 'title tələb olunur');
    }

    const { data: document, error } = await createAdminClient()
      .from('documents')
      .update({ title: title.trim() })
      .eq('id', id)
      .select('id, title')
      .single();

    if (error || !document) return notFound('Sənəd tapılmadı');

    return NextResponse.json({ document });
  }

  if (type === 'coin-price') {
    const body = await request.json().catch(() => null);
    const price = body?.price;

    if (
      price !== null &&
      price !== undefined &&
      (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > MAX_ALLOWED_PRICE)
    ) {
      return apiError(400, `price null və ya 0-${MAX_ALLOWED_PRICE} arasında müsbət ədəd olmalıdır`);
    }

    const admin = createAdminClient();

    if (price === null || price === undefined) {
      const { error } = await admin.from('app_settings').delete().eq('key', COIN_PRICE_SETTING_KEY);
      if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
      return NextResponse.json({ price: DEFAULT_MESSAGE_PRICE, source: 'default' });
    }

    const { error } = await admin
      .from('app_settings')
      .upsert({ key: COIN_PRICE_SETTING_KEY, value: price, updated_at: new Date().toISOString() });

    if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');

    return NextResponse.json({ price, source: 'table' });
  }

  if (type === 'daily-coin-grant') {
    const body = await request.json().catch(() => null);
    const dailyCoinGrant = body?.dailyCoinGrant;

    if (
      dailyCoinGrant !== null &&
      dailyCoinGrant !== undefined &&
      (typeof dailyCoinGrant !== 'number' ||
        !Number.isInteger(dailyCoinGrant) ||
        dailyCoinGrant <= 0 ||
        dailyCoinGrant > MAX_ALLOWED)
    ) {
      return apiError(400, `dailyCoinGrant null və ya 1-${MAX_ALLOWED} arasında tam ədəd olmalıdır`);
    }

    const admin = createAdminClient();

    if (dailyCoinGrant === null || dailyCoinGrant === undefined) {
      const { error } = await admin.from('app_settings').delete().eq('key', DAILY_COIN_GRANT_SETTING_KEY);
      if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
      return NextResponse.json({ dailyCoinGrant: DEFAULT_DAILY_LIMIT, source: 'default' });
    }

    const { error } = await admin
      .from('app_settings')
      .upsert({ key: DAILY_COIN_GRANT_SETTING_KEY, value: dailyCoinGrant, updated_at: new Date().toISOString() });

    if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');

    return NextResponse.json({ dailyCoinGrant, source: 'table' });
  }

  if (type === 'lesson-economy') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return apiError(400, 'Gövdə düzgün deyil');

    // Partial update: only the params actually present are touched. null
    // explicitly RESETS a tunable to its TS-side default by deleting the row,
    // same convention as coin-price / daily-coin-grant above.
    const present = LESSON_ECONOMY_FIELDS.filter((f) => body[f.param] !== undefined);

    if (present.length === 0) {
      return apiError(400, `Yeniləmək üçün heç olmasa bir sahə tələb olunur: ${LESSON_ECONOMY_FIELDS.map((f) => f.param).join(', ')}`);
    }

    // Validate everything BEFORE writing anything, so a bad value in one field
    // can't leave a half-applied config — same all-or-nothing posture as the
    // 'user' branch below.
    for (const field of present) {
      const value = body[field.param];
      if (value === null) continue;
      if (typeof value !== 'number' || !isValidLessonEconomyValue(field, value)) {
        return apiError(
          400,
          `${field.param} null və ya ${field.min}-${field.max} arasında ${field.integerOnly ? 'tam ' : ''}ədəd olmalıdır`
        );
      }
    }

    const admin = createAdminClient();

    for (const field of present) {
      const value = body[field.param];

      if (value === null) {
        const { error } = await admin.from('app_settings').delete().eq('key', field.key);
        if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
        continue;
      }

      const { error } = await admin
        .from('app_settings')
        .upsert({ key: field.key, value, updated_at: new Date().toISOString() });
      if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');
    }

    const { data, error } = await admin
      .from('app_settings')
      .select('key, value')
      .in('key', LESSON_ECONOMY_KEYS);

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));

    const settings = Object.fromEntries(
      LESSON_ECONOMY_FIELDS.map((field) => {
        const raw = byKey.get(field.key);
        const numeric = raw === undefined || raw === null ? null : Number(raw);
        const isConfigured = numeric !== null && isValidLessonEconomyValue(field, numeric);
        return [
          field.param,
          {
            value: isConfigured ? numeric : field.defaultValue,
            source: isConfigured ? 'table' : 'default',
          },
        ];
      })
    );

    return NextResponse.json({ settings });
  }

  if (type === 'user') {
    const id = searchParams.get('id');
    if (!id) return apiError(400, 'id tələb olunur');

    const body = await request.json().catch(() => null);
    const hasRole = body?.role !== undefined;
    const hasDailyCoinLimit = body?.dailyCoinLimit !== undefined;
    const hasGrantCoins = body?.grantCoins !== undefined;

    if (!hasRole && !hasDailyCoinLimit && !hasGrantCoins) {
      return apiError(400, 'role, dailyCoinLimit və ya grantCoins göndərilməlidir');
    }

    // dailyCoinLimit/grantCoins are handled separately below (they write to
    // user_coins via the service-role client, not profiles via the
    // RLS-respecting one) — validated up front here so a bad value in either
    // field fails the whole request before any write happens, same
    // all-or-nothing validation posture as role below.
    if (hasDailyCoinLimit) {
      const dailyCoinLimit = body.dailyCoinLimit;
      if (
        dailyCoinLimit !== null &&
        (typeof dailyCoinLimit !== 'number' ||
          !Number.isFinite(dailyCoinLimit) ||
          dailyCoinLimit <= 0 ||
          dailyCoinLimit > MAX_ALLOWED_DAILY_COIN_LIMIT)
      ) {
        return apiError(400, `dailyCoinLimit null və ya 0-${MAX_ALLOWED_DAILY_COIN_LIMIT} arasında müsbət ədəd olmalıdır`);
      }
    }

    if (hasGrantCoins) {
      const grantCoins = body.grantCoins;
      if (typeof grantCoins !== 'number' || !Number.isFinite(grantCoins) || grantCoins === 0 || Math.abs(grantCoins) > MAX_ALLOWED_COIN_GRANT) {
        return apiError(400, `grantCoins sıfırdan fərqli, mütləq dəyəri ${MAX_ALLOWED_COIN_GRANT}-dən az ədəd olmalıdır`);
      }
    }

    const update: { role?: string } = {};

    if (hasRole) {
      const role = body.role;
      if (typeof role !== 'string' || !ASSIGNABLE_ROLES.has(role)) {
        return apiError(400, "role 'admin' və ya 'user' olmalıdır");
      }
      if (id === auth.userId) {
        return apiError(400, 'Öz rolunuzu bu yolla dəyişə bilməzsiniz');
      }
      update.role = role;
    }

    const supabase = await createClient();

    let profile: { id: string; role: string } | null;

    if (hasRole) {
      // RLS-respecting client: relies on the profiles_update_admin policy
      // (0026_remove_super_admin.sql), which itself checks is_admin() — so this
      // update fails closed even if the requireAdmin() check above were ever
      // bypassed.
      const { data, error } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', id)
        .select('id, role')
        .maybeSingle();

      if (error) return serverError(error, 'İstifadəçini yeniləmək uğursuz oldu');
      profile = data;
    } else {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', id)
        .maybeSingle();

      if (error) return serverError(error, 'İstifadəçi məlumatı alınmadı');
      profile = data;
    }

    if (!profile) return notFound('İstifadəçi tapılmadı');

    // user_coins is not RLS-writable by admins (0036 — only a self-SELECT
    // policy exists), so these two writes use the service-role client, same
    // pattern as ingestion/document routes: legitimate only because
    // requireAdmin() has already gated this whole handler.
    let coins: { balance: number; daily_limit: number | null } | null = null;
    if (hasDailyCoinLimit || hasGrantCoins) {
      const admin = createAdminClient();

      if (hasDailyCoinLimit) {
        const dailyCoinLimit = body.dailyCoinLimit;
        const { error: coinError } = await admin
          .from('user_coins')
          .upsert({ user_id: id, daily_limit: dailyCoinLimit ?? null }, { onConflict: 'user_id', ignoreDuplicates: false });
        if (coinError) return serverError(coinError, 'Gündəlik coin limitini yeniləmək uğursuz oldu');
      }

      if (hasGrantCoins) {
        const grantCoins = body.grantCoins;
        // Row may not exist yet for a user who has never sent a chat message —
        // ensure it exists before the increment RPC-less update below (a plain
        // upsert with balance = balance + amount can't reference the existing
        // value across an insert, so this uses insert-if-missing then a
        // separate update, not fully race-free but acceptable here since grants
        // are an infrequent admin action, not a hot concurrent path like debit).
        await admin.from('user_coins').insert({ user_id: id }).select('user_id').maybeSingle();
        const { data: current, error: readError } = await admin
          .from('user_coins')
          .select('balance')
          .eq('user_id', id)
          .single();
        if (readError) return serverError(readError, 'Coin balansını oxumaq uğursuz oldu');

        const newBalance = Math.max(0, Number(current.balance) + grantCoins);
        const { error: grantError } = await admin.from('user_coins').update({ balance: newBalance }).eq('user_id', id);
        if (grantError) return serverError(grantError, 'Coin hədiyyə etmək uğursuz oldu');
      }

      const { data: coinRow, error: coinReadError } = await admin
        .from('user_coins')
        .select('balance, daily_limit')
        .eq('user_id', id)
        .maybeSingle();
      if (coinReadError) return serverError(coinReadError, 'Coin məlumatını oxumaq uğursuz oldu');
      coins = coinRow ?? null;
    }

    return NextResponse.json({ profile, coins });
  }

  if (type !== 'rate-limit') {
    return apiError(400, 'type parametri düzgün deyil');
  }

  const body = await request.json().catch(() => null);
  const maxPerDay = body?.maxPerDay;

  if (
    maxPerDay !== null &&
    maxPerDay !== undefined &&
    (typeof maxPerDay !== 'number' ||
      !Number.isInteger(maxPerDay) ||
      maxPerDay <= 0 ||
      maxPerDay > MAX_ALLOWED)
  ) {
    return apiError(400, `maxPerDay null və ya 1-${MAX_ALLOWED} arasında tam ədəd olmalıdır`);
  }

  const admin = createAdminClient();

  if (maxPerDay === null || maxPerDay === undefined) {
    const { error } = await admin.from('app_settings').delete().eq('key', GLOBAL_DEFAULT_SETTING_KEY);
    if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
    return NextResponse.json({ maxPerDay: ENV_DEFAULT_MAX_PER_WINDOW, source: 'env' });
  }

  const { error } = await admin
    .from('app_settings')
    .upsert({ key: GLOBAL_DEFAULT_SETTING_KEY, value: maxPerDay, updated_at: new Date().toISOString() });

  if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');

  return NextResponse.json({ maxPerDay, source: 'table' });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type === 'background-image') {
    // Only clears the app_settings override so the home page falls back to
    // the static /bg.png; the now-orphaned object is left in the
    // public-assets bucket rather than deleted here — same low-stakes
    // tradeoff as other reset branches in this file (e.g. coin-price PATCH
    // null) which don't clean up anything beyond the setting row.
    const { error } = await createAdminClient().from('app_settings').delete().eq('key', HOME_BACKGROUND_SETTING_KEY);
    if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
    return NextResponse.json({ url: null });
  }

  if (type === 'logo') {
    // Same orphaned-storage-object tradeoff as background-image above.
    const { error } = await createAdminClient().from('app_settings').delete().eq('key', SITE_LOGO_SETTING_KEY);
    if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
    return NextResponse.json({ url: null });
  }

  // Folded in from app/api/admin/documents/route.ts — `?id=` deletes one,
  // a JSON body `{ ids: [...] }` deletes many.
  if (type === 'documents') {
    const documentId = searchParams.get('id');
    const supabase = createAdminClient();

    if (documentId) {
      const { data: document, error: fetchError } = await supabase
        .from('documents')
        .select('storage_path')
        .eq('id', documentId)
        .single();
      if (fetchError || !document) {
        return notFound('Sənəd tapılmadı');
      }

      try {
        await deleteDocuments(supabase, [documentId]);
      } catch (error) {
        return serverError(error, 'Sənədi silmək uğursuz oldu');
      }

      return NextResponse.json({ ok: true });
    }

    const body = await request.json().catch(() => null);
    const ids = body?.ids;

    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((value) => typeof value === 'string')) {
      return apiError(400, 'ids tələb olunur');
    }

    try {
      const { deletedCount } = await deleteDocuments(supabase, ids);
      return NextResponse.json({ ok: true, deleted: deletedCount });
    } catch (error) {
      return serverError(error, 'Sənədləri silmək uğursuz oldu');
    }
  }

  if (type !== 'busy-phrases') {
    return apiError(400, 'type parametri düzgün deyil');
  }

  let id = searchParams.get('id');
  if (!id) {
    const body = await request.json().catch(() => null);
    id = body?.id ?? null;
  }

  if (typeof id !== 'string' || id.trim().length === 0) {
    return apiError(400, 'id tələb olunur');
  }

  const { error } = await createAdminClient().from('chat_busy_phrases').delete().eq('id', id);

  if (error) return serverError(error, 'Status cümləsini silmək uğursuz oldu');

  return NextResponse.json({ ok: true });
}
