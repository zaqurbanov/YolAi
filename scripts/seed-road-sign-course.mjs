// Seeds the hand-authored "Yol Nişanları — hekayələrlə öyrən" course into the
// live database from scripts/data/road-signs-course.mjs.
//
// WHY THIS COURSE IS SEEDED AND NOT GENERATED. Every other course in /admin/
// kurslar is drafted by the LLM pipeline (lib/lessons/generateTopicContent.ts)
// and then reviewed. That pipeline cannot produce this one: the sign catalog
// is a `KOD | Təsvir` table, so each chunk is a one-line description with no
// prose to ground a lesson in, and — more importantly — the lessons must embed
// the `![nisan:X]` image markers in exactly the right places, keyed to codes
// that exist in sign_images. The content in scripts/data/road-signs-course.mjs
// is therefore hand-written against the real chunk text (every rule, number
// and meaning is taken from the document; only the story framing is added).
//
// WHAT IT WRITES
//   lesson_courses  -- one row, status 'published', pointing at the sign document
//   lesson_topics   -- one row per lesson, status 'published', with
//                      source_citations resolved from the live chunks
//   quiz_questions  -- the per-lesson pool, status 'published', topic_id set
//
// OPTION ORDER IS SHUFFLED HERE, NOT IN THE DATA FILE. Every question in the
// data file is authored with `correct: 0` because that is far easier to write
// and to review. Nothing shuffles options at serve time — lib/quiz/topicTest.ts
// samples WHICH questions are drawn but renders `options` in stored order — so
// seeding them as authored would make "always pick the first answer" a perfect
// strategy. The permutation below is derived from a hash of the question text,
// so it is stable: re-seeding produces the same layout rather than reshuffling
// a pool users may already have seen.
//
// USAGE (from the repo root; needs the service-role key):
//   node --env-file=.env.local scripts/seed-road-sign-course.mjs
//   node --env-file=.env.local scripts/seed-road-sign-course.mjs --replace
//   node --env-file=.env.local scripts/seed-road-sign-course.mjs --dry-run
//
// --replace DELETES the existing course with the same title first. That
// cascades to its topics, their question pools AND every user_course_unlocks /
// user_topic_progress row for it (0060's FKs) — i.e. it throws away purchases
// and progress. Without the flag an existing course is left alone and the
// script exits, which is the safe default.

import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SIGN, COURSE, LESSONS } from './data/road-signs-course.mjs';

// The sign catalog document in the live project. Overridable with
// --document <uuid> so the script can be pointed at a re-ingested copy.
const DEFAULT_SIGN_DOC_ID = '6d157672-7441-4062-8b5b-a3d3f59c0e0d';

const args = process.argv.slice(2);
const REPLACE = args.includes('--replace');
const DRY_RUN = args.includes('--dry-run');
const DOC_ID = args.includes('--document')
  ? args[args.indexOf('--document') + 1]
  : DEFAULT_SIGN_DOC_ID;

// `node --env-file=.env.local` is the intended invocation, but the repo's
// existing one-off scripts are run bare too, so fall back to parsing the file
// rather than failing with an unhelpful "supabaseUrl is required".
function env(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${name}=`));
    return line ? line.slice(name.length + 1).trim() : undefined;
  } catch {
    return undefined;
  }
}

const supabase = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

/**
 * Deterministic permutation of a 4-option question, driven by a hash of the
 * question text. Returns the reordered options plus the new index of the
 * originally-correct answer.
 */
function shuffleOptions(question, options, correct) {
  const digest = createHash('sha256').update(question).digest();
  const order = options.map((option, index) => ({ option, index }));
  // Fisher-Yates driven by successive digest bytes — no RNG, so the same
  // question always lands in the same arrangement.
  for (let i = order.length - 1; i > 0; i--) {
    const j = digest[i] % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    options: order.map((o) => o.option),
    correctIndex: order.findIndex((o) => o.index === correct),
  };
}

/**
 * Resolves a sign code to the chunk it was written from.
 *
 * Codes are NOT unique in this document: the catalog section and the road-
 * markings section both use `Kod 1.2`, `Kod 1.5`, … for entirely different
 * things (a 21-label overlap). Where the data file supplies a `match` fragment
 * that fragment decides; otherwise the lowest chunk_index wins, which is the
 * catalog section — markings come later in the document.
 *
 * Some codes have no chunk of their own: unpdf glues short catalog rows onto
 * the previous entry, so e.g. `5.26-1` and `5.29.1-1` live inside the text of
 * the chunk labelled with the preceding code. Those fall back to a content
 * scan, which finds the chunk the description actually sits in.
 */
function resolveChunk(code, chunksByLabel, allChunks) {
  const candidates = chunksByLabel.get(`Kod ${code}`);
  if (!candidates || candidates.length === 0) {
    return allChunks.find((c) => c.content.includes(`${code} `)) ?? null;
  }
  const fragment = SIGN[code]?.match;
  if (fragment) {
    const hit = candidates.find((c) => c.content.includes(fragment));
    if (hit) return hit;
  }
  return candidates[0];
}

async function main() {
  const { data: document, error: documentError } = await supabase
    .from('documents')
    .select('id, title')
    .eq('id', DOC_ID)
    .maybeSingle();

  if (documentError) throw documentError;
  if (!document) {
    throw new Error(
      `Sənəd tapılmadı: ${DOC_ID}. Yol nişanları sənədinin id-sini --document ilə ötür.`
    );
  }

  const { data: chunks, error: chunksError } = await supabase
    .from('chunks')
    .select('id, article_label, content, page_number, chunk_index')
    .eq('document_id', DOC_ID)
    .order('chunk_index', { ascending: true });
  if (chunksError) throw chunksError;

  const chunksByLabel = new Map();
  for (const chunk of chunks ?? []) {
    const label = String(chunk.article_label ?? '').trim();
    if (!label) continue;
    if (!chunksByLabel.has(label)) chunksByLabel.set(label, []);
    chunksByLabel.get(label).push(chunk);
  }

  const { data: images, error: imagesError } = await supabase
    .from('sign_images')
    .select('code')
    .eq('document_id', DOC_ID)
    .eq('position', 0);
  if (imagesError) throw imagesError;
  const imageCodes = new Set((images ?? []).map((row) => row.code));

  // Pre-flight: report codes whose IMAGE is missing (the lesson would render
  // the "şəkli mövcud deyil" fallback) and codes whose CHUNK is missing (the
  // lesson loses that citation). Neither is fatal — both degrade gracefully —
  // but both are content bugs worth seeing before publishing.
  const missingImages = new Set();
  const missingChunks = new Set();
  for (const lesson of LESSONS) {
    for (const match of lesson.content.matchAll(/!\[nisan:([^\]]+)\]/g)) {
      const code = match[1].replace(/^Kod\s+/i, '').trim();
      if (!imageCodes.has(code)) missingImages.add(code);
    }
    for (const code of lesson.codes) {
      if (!resolveChunk(code, chunksByLabel, chunks ?? [])) missingChunks.add(code);
    }
  }

  console.log(`Sənəd: ${document.title} (${document.id})`);
  console.log(`Dərs sayı: ${LESSONS.length}`);
  console.log(`Sual sayı: ${LESSONS.reduce((sum, l) => sum + l.questions.length, 0)}`);
  if (missingImages.size > 0) {
    console.warn(`⚠ Şəkli olmayan kodlar (${missingImages.size}): ${[...missingImages].join(', ')}`);
  }
  if (missingChunks.size > 0) {
    console.warn(`⚠ Mənbə chunk-ı tapılmayan kodlar (${missingChunks.size}): ${[...missingChunks].join(', ')}`);
  }

  if (DRY_RUN) {
    console.log('--dry-run: baza dəyişdirilmədi.');
    return;
  }

  const { data: existing, error: existingError } = await supabase
    .from('lesson_courses')
    .select('id, title')
    .eq('document_id', DOC_ID)
    .eq('title', COURSE.title)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing && !REPLACE) {
    console.log(
      `Bu kurs artıq mövcuddur (${existing.id}). Yenidən yaratmaq üçün --replace ilə işlət ` +
        '(diqqət: mövcud alışlar və istifadəçi irəliləyişi silinir).'
    );
    return;
  }

  if (existing && REPLACE) {
    const { error: deleteError } = await supabase
      .from('lesson_courses')
      .delete()
      .eq('id', existing.id);
    if (deleteError) throw deleteError;
    console.log(`Köhnə kurs silindi: ${existing.id}`);
  }

  // order_index: park the course after every existing one rather than at 0, so
  // seeding does not reshuffle the /oyrenme list an admin has already ordered.
  const { data: lastCourse } = await supabase
    .from('lesson_courses')
    .select('order_index')
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle();
  const orderIndex = (lastCourse?.order_index ?? -1) + 1;

  const { data: course, error: courseError } = await supabase
    .from('lesson_courses')
    .insert({
      document_id: DOC_ID,
      title: COURSE.title,
      description: COURSE.description,
      order_index: orderIndex,
      is_free: COURSE.isFree ?? false,
      status: 'published',
    })
    .select('id')
    .single();
  if (courseError) throw courseError;
  console.log(`Kurs yaradıldı: ${course.id} (order_index ${orderIndex})`);

  let topicCount = 0;
  let questionCount = 0;

  for (const [index, lesson] of LESSONS.entries()) {
    const citations = lesson.codes
      .map((code) => {
        const chunk = resolveChunk(code, chunksByLabel, chunks ?? []);
        if (!chunk) return null;
        return {
          chunk_id: chunk.id,
          article_label: chunk.article_label,
          page_number: chunk.page_number,
        };
      })
      .filter(Boolean);

    const { data: topic, error: topicError } = await supabase
      .from('lesson_topics')
      .insert({
        course_id: course.id,
        title: lesson.title,
        content: lesson.content,
        source_citations: citations,
        order_index: index,
        status: 'published',
      })
      .select('id')
      .single();
    if (topicError) throw topicError;
    topicCount += 1;

    const rows = lesson.questions.map((q) => {
      const { options, correctIndex } = shuffleOptions(q.q, q.options, q.correct);
      return {
        topic_id: topic.id,
        // quiz_questions.category is NOT NULL and still serves the 0051
        // category-authored bank; topic-authored questions write the topic
        // title as a human-readable placeholder, matching what
        // lib/lessons/courses.ts does for generated pools.
        category: lesson.title.slice(0, 200),
        question: q.q,
        options,
        correct_index: correctIndex,
        explanation: q.explanation ?? null,
        status: 'published',
        source_title: document.title,
      };
    });

    const { error: questionError } = await supabase.from('quiz_questions').insert(rows);
    if (questionError) throw questionError;
    questionCount += rows.length;

    console.log(
      `  ${String(index + 1).padStart(2, '0')}. ${lesson.title} — ${rows.length} sual, ${citations.length} istinad`
    );
  }

  console.log(`\nHAZIRDIR: ${topicCount} mövzu, ${questionCount} sual dərc edildi.`);
  console.log(`Kurs id: ${course.id}`);
}

main().catch((error) => {
  console.error('SEED FAILED:', error?.message ?? error);
  process.exit(1);
});
