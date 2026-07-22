'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import type { LessonCourseRow, LessonTopicRow } from '@/lib/lessons/courses';
import type { TopicProposal } from '@/lib/lessons/proposeTopics';
import {
  generateTopicContentAction,
  generateTopicQuestionsAction,
  listCourseTopicsAction,
  proposeTopicsAction,
  publishTopicQuestionsAction,
  updateTopicAction,
} from './actions';
import TopicProposalEditor from './TopicProposalEditor';
import TopicCard from './TopicCard';

interface CourseTopicsPanelProps {
  course: LessonCourseRow;
  onPublishCourse: () => void;
  onDeleteCourse: () => void;
  onTopicsChanged: () => void;
}

export type GenStatus = 'idle' | 'queued' | 'running' | 'done' | 'error';

/** The two independent halves of a topic's generation. */
export type GenStep = 'content' | 'questions';

export interface GenStepState {
  status: GenStatus;
  message?: string;
}

export interface GenState {
  /** Roll-up across the steps this run covered. */
  status: GenStatus;
  message?: string;
  /** Which steps this run covers — drives both the UI and the progress total. */
  steps: GenStep[];
  content?: GenStepState;
  questions?: GenStepState;
  belowPoolMinimum?: boolean;
  missingChunkCount?: number;
  questionsCreated?: number;
}

const BOTH_STEPS: GenStep[] = ['content', 'questions'];

interface GenTarget {
  id: string;
  steps: GenStep[];
}

// THE GENERATION LOOP LIVES HERE, ON THE CLIENT, BY DESIGN.
//
// The per-topic generation actions handle exactly ONE topic (one content call +
// one questions LLM call). A 20-topic document is therefore 20 sequential
// client-driven invocations. Do NOT "optimize" this into a single action that
// loops server-side: a whole document in one request blows Vercel's 300s Hobby
// maxDuration and loses every topic generated up to the timeout. Driving it
// from here means each topic commits independently, progress is visible per
// topic, and a failure at topic 14 leaves topics 1-13 saved and topic 14
// individually retryable.
export default function CourseTopicsPanel({
  course,
  onPublishCourse,
  onDeleteCourse,
  onTopicsChanged,
}: CourseTopicsPanelProps) {
  const [topics, setTopics] = useState<LessonTopicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [proposal, setProposal] = useState<TopicProposal | null>(null);
  const [proposing, setProposing] = useState<'ai' | 'deterministic' | null>(null);
  const [proposeElapsed, setProposeElapsed] = useState(0);
  const [genStates, setGenStates] = useState<Record<string, GenState>>({});
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cooperative cancellation: the in-flight topic always finishes (its work is
  // already committed server-side), the loop just stops before the next one.
  const abortRef = useRef(false);

  const loadTopics = useCallback(async () => {
    const result = await listCourseTopicsAction(course.id);
    if (result.ok) setTopics(result.data);
    else setError(result.error);
    setLoading(false);
  }, [course.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount for the selected course; the state lands after an await, not during render.
    void loadTopics();
  }, [loadTopics]);

  // A 500+ chunk document takes ~15s here. A bare spinner for that long reads
  // as "hung", so the pending panel counts seconds out loud.
  useEffect(() => {
    if (!proposing) return;
    const timer = setInterval(() => setProposeElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [proposing]);

  async function handlePropose(strategy: 'ai' | 'deterministic') {
    setError(null);
    setProposeElapsed(0);
    setProposing(strategy);
    try {
      const result = await proposeTopicsAction(course.documentId, strategy);
      if (!result.ok) {
        // NOT setProposal(...) on failure, and nothing here hides the propose
        // buttons: an empty/failed proposal used to be stored anyway, which
        // collapsed the whole panel and left no way to retry.
        setError(result.error);
        return;
      }
      if (result.data.topics.length === 0) {
        setError('Təklif boş qayıtdı — sənəddə emal ediləcək mətn tapılmadı');
        return;
      }
      setProposal(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xəta baş verdi');
    } finally {
      setProposing(null);
    }
  }

  function patchStep(topicId: string, step: GenStep, state: GenStepState) {
    setGenStates((prev) => {
      const base: GenState = prev[topicId] ?? { status: 'running', steps: BOTH_STEPS };
      return {
        ...prev,
        [topicId]:
          step === 'content' ? { ...base, content: state } : { ...base, questions: state },
      };
    });
  }

  // Per-target `steps` is what makes the per-topic «Dərs materialı yarat» /
  // «Suallar yarat» buttons the same code path as the bulk run — one place owns
  // abort, retry, error capture and progress accounting. It is per TARGET and
  // not per RUN so a retry only re-runs the half that actually failed, instead
  // of overwriting a reading draft that generated fine.
  async function runGeneration(targets: GenTarget[]) {
    const queue = targets.filter((t) => t.steps.length > 0);
    if (queue.length === 0 || running) return;

    setError(null);
    abortRef.current = false;
    setRunning(true);

    setGenStates((prev) => {
      const next = { ...prev };
      for (const target of queue) next[target.id] = { status: 'queued', steps: target.steps };
      return next;
    });

    for (const { id: topicId, steps } of queue) {
      if (abortRef.current) {
        setGenStates((prev) => ({
          ...prev,
          [topicId]: { status: 'idle', steps, message: 'Dayandırıldı' },
        }));
        continue;
      }

      setGenStates((prev) => ({ ...prev, [topicId]: { status: 'running', steps } }));

      let failed = false;
      let questionsCreated: number | undefined;
      let belowPoolMinimum = false;
      let missingChunkCount = 0;

      if (steps.includes('content')) {
        patchStep(topicId, 'content', { status: 'running' });
        try {
          const content = await generateTopicContentAction(topicId);
          if (content.ok) {
            patchStep(topicId, 'content', { status: 'done' });
            missingChunkCount = content.data.missingChunkCount || missingChunkCount;
          } else {
            patchStep(topicId, 'content', { status: 'error', message: content.error });
            failed = true;
          }
        } catch (e) {
          // A rejected action (network drop, function timeout) must be caught
          // per step — otherwise the whole run dies silently mid-loop.
          patchStep(topicId, 'content', {
            status: 'error',
            message: e instanceof Error ? e.message : 'Şəbəkə xətası',
          });
          failed = true;
        }
      }

      // Attempted even when content failed: the question pool is generated from
      // the topic's source chunks, not from the reading material, so the two
      // halves are genuinely independent (lib/lessons/courses.ts).
      if (steps.includes('questions')) {
        patchStep(topicId, 'questions', { status: 'running' });
        try {
          const questions = await generateTopicQuestionsAction(topicId);
          if (questions.ok) {
            patchStep(topicId, 'questions', { status: 'done' });
            questionsCreated = questions.data.questionsCreated;
            belowPoolMinimum = questions.data.belowPoolMinimum;
            missingChunkCount = questions.data.missingChunkCount || missingChunkCount;
          } else {
            patchStep(topicId, 'questions', { status: 'error', message: questions.error });
            failed = true;
          }
        } catch (e) {
          patchStep(topicId, 'questions', {
            status: 'error',
            message: e instanceof Error ? e.message : 'Şəbəkə xətası',
          });
          failed = true;
        }
      }

      setGenStates((prev) => {
        const base: GenState = prev[topicId] ?? { status: 'running', steps };
        return {
          ...prev,
          [topicId]: {
            ...base,
            status: failed ? 'error' : 'done',
            questionsCreated,
            belowPoolMinimum,
            missingChunkCount,
          },
        };
      });
    }

    setRunning(false);
    // One resync at the end rather than one per topic: N extra round trips
    // during a long run would slow the loop down for no added information,
    // since live progress already comes from genStates.
    await loadTopics();
    onTopicsChanged();
  }

  async function handlePublishTopic(topic: LessonTopicRow) {
    setError(null);
    // ORDER IS ENFORCED BY THE BACKEND: questions first, then the topic. A
    // topic with no published questions is refused, so this must not be
    // reordered or run as two independent buttons.
    try {
      const questions = await publishTopicQuestionsAction(topic.id);
      if (!questions.ok) {
        setError(questions.error);
        return;
      }

      const published = await updateTopicAction(topic.id, { status: 'published' });
      if (!published.ok) {
        setError(published.error);
        return;
      }

      await loadTopics();
      onTopicsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xəta baş verdi');
    }
  }

  // Only the missing half is queued per topic: a topic that already has content
  // but no questions costs one call here, not two.
  const pendingTargets: GenTarget[] = topics
    .map((t) => ({
      id: t.id,
      steps: BOTH_STEPS.filter((step) =>
        step === 'content' ? t.content === null : t.questionCount === 0
      ),
    }))
    .filter((t) => t.steps.length > 0);

  const failedTargets: GenTarget[] = Object.entries(genStates)
    .filter(([, s]) => s.status === 'error')
    .map(([id, s]) => ({
      id,
      steps: s.steps.filter((step) =>
        step === 'content' ? s.content?.status === 'error' : s.questions?.status === 'error'
      ),
    }))
    .filter((t) => t.steps.length > 0);

  // Progress is counted in STEPS, not topics: a 10-topic run is 20 units of
  // work and a bar that only moves twice per topic understates what is
  // happening during the slow half.
  const active = Object.values(genStates).filter((s) => s.status !== 'idle');
  const totalSteps = active.reduce((sum, s) => sum + s.steps.length, 0);
  const doneSteps = active.reduce(
    (sum, s) =>
      sum +
      s.steps.filter((step) => {
        const state = step === 'content' ? s.content : s.questions;
        return state?.status === 'done' || state?.status === 'error';
      }).length,
    0
  );
  const doneCount = active.filter((s) => s.status === 'done').length;
  const totalQueued = active.length;
  const canPublishCourse =
    course.status !== 'published' && topics.some((t) => t.status === 'published');

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-2xl p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold">{course.title}</h2>
            <p className="mt-1 text-label-sm text-on-surface-variant">
              Mənbə: {course.documentTitle ?? 'tapılmadı'} · {course.publishedTopicCount}/
              {course.topicCount} mövzu dərc edilib
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canPublishCourse && (
              <Button variant="primary" size="sm" isDisabled={running} onPress={onPublishCourse}>
                Kursu dərc et
              </Button>
            )}
            <Button variant="ghost" size="sm" isDisabled={running} onPress={onDeleteCourse}>
              Kursu sil
            </Button>
          </div>
        </div>

        {course.status !== 'published' && !canPublishCourse && (
          <p className="mono-label mt-3 text-on-surface-variant">
            Kursu dərc etmək üçün ən azı bir mövzu dərc edilməlidir.
          </p>
        )}

        {error && (
          <div className="mt-3 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
      </div>

      {proposal && (
        <TopicProposalEditor
          courseId={course.id}
          proposal={proposal}
          onCancel={() => setProposal(null)}
          onCreated={(created) => {
            setProposal(null);
            setTopics((prev) => [...prev, ...created].sort((a, b) => a.orderIndex - b.orderIndex));
            onTopicsChanged();
          }}
        />
      )}

      {!proposal && (
        <div className="glass-card rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="mono-label text-on-surface-variant uppercase">
                Mövzular ({topics.length})
              </div>
              {running && (
                <p className="mt-1 text-label-sm text-primary">
                  Generasiya gedir — {doneCount}/{totalQueued} mövzu, {doneSteps}/{totalSteps}{' '}
                  addım tamamlandı. Səhifəni bağlamayın.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {topics.length === 0 && !proposing && (
                <>
                  <Button variant="primary" size="sm" onPress={() => void handlePropose('ai')}>
                    Mövzuları təklif et (AI)
                  </Button>
                  {/* Escape hatch: the mechanical split is instant and is also
                      what the AI path degrades to, so it stays selectable when
                      the AI grouping comes back poor. */}
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => void handlePropose('deterministic')}
                  >
                    Mexaniki bölgü
                  </Button>
                </>
              )}

              {pendingTargets.length > 0 && !running && (
                <Button
                  variant="primary"
                  size="sm"
                  onPress={() => void runGeneration(pendingTargets)}
                >
                  {pendingTargets.length} mövzu üçün material + suallar yarat
                </Button>
              )}

              {failedTargets.length > 0 && !running && (
                <Button variant="outline" size="sm" onPress={() => void runGeneration(failedTargets)}>
                  {failedTargets.length} uğursuzu təkrarla
                </Button>
              )}

              {running && (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => {
                    abortRef.current = true;
                  }}
                >
                  Növbəti mövzudan sonra dayandır
                </Button>
              )}
            </div>
          </div>

          {running && totalSteps > 0 && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.round((doneSteps / totalSteps) * 100)}%` }}
              />
            </div>
          )}

          {/* proposeTopicsAction is the slow one on this page (~15s for a
              500-chunk document). This panel replaces the buttons while it
              runs and counts seconds so the wait reads as progress, not as a
              hang. */}
          {proposing && (
            <div className="mt-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-primary">
                <Spinner size="sm" tone="current" />
                {proposing === 'ai'
                  ? 'AI sənədin bölmələrini oxuyur və mövzu sərhədlərini qurur…'
                  : 'Sənəd mexaniki olaraq bölünür…'}
                <span className="mono-label ml-auto">{proposeElapsed} san.</span>
              </div>
              <p className="mt-1.5 text-label-sm text-on-surface-variant">
                {proposing === 'ai'
                  ? 'Böyük sənədlərdə bu 15–30 saniyə çəkə bilər. Səhifəni bağlamayın.'
                  : 'Bir neçə saniyə çəkir.'}
              </p>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-tertiary">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
              </div>
            </div>
          )}

          <div className="mt-4 space-y-3">
            {loading ? (
              <div className="flex items-center gap-2 px-1 py-6 text-sm text-on-surface-variant">
                <Spinner size="sm" tone="current" />
                Mövzular yüklənir…
              </div>
            ) : topics.length === 0 ? (
              <div className="rounded-xl border border-outline-variant/40 px-4 py-8 text-center text-sm text-on-surface-variant">
                Bu kursda hələ mövzu yoxdur. «Mövzuları təklif et (AI)» ilə sənədin bölmə
                sərhədlərindən mövzu layihələri qurun.
              </div>
            ) : (
              topics.map((topic, index) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  index={index}
                  gen={genStates[topic.id]}
                  isRunLocked={running}
                  onGenerateContent={() =>
                    void runGeneration([{ id: topic.id, steps: ['content'] }])
                  }
                  onGenerateQuestions={() =>
                    void runGeneration([{ id: topic.id, steps: ['questions'] }])
                  }
                  onPublish={() => void handlePublishTopic(topic)}
                  onSplit={(refreshed) => {
                    setTopics(refreshed);
                    setGenStates((prev) => {
                      const next = { ...prev };
                      delete next[topic.id];
                      return next;
                    });
                    onTopicsChanged();
                  }}
                  onChanged={() => {
                    void loadTopics();
                    onTopicsChanged();
                  }}
                  onError={setError}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
