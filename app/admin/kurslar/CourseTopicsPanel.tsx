'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import type { LessonCourseRow, LessonTopicRow } from '@/lib/lessons/courses';
import type { TopicProposal } from '@/lib/lessons/proposeTopics';
import {
  generateTopicMaterialAction,
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

export interface GenState {
  status: GenStatus;
  message?: string;
  belowPoolMinimum?: boolean;
  missingChunkCount?: number;
  questionsCreated?: number;
}

// THE GENERATION LOOP LIVES HERE, ON THE CLIENT, BY DESIGN.
//
// generateTopicMaterialAction handles exactly ONE topic (one content LLM call +
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
  const [proposing, setProposing] = useState(false);
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
    void loadTopics();
  }, [loadTopics]);

  async function handlePropose() {
    setError(null);
    setProposing(true);
    try {
      const result = await proposeTopicsAction(course.documentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setProposal(result.data);
    } finally {
      setProposing(false);
    }
  }

  async function runGeneration(targetIds: string[]) {
    if (targetIds.length === 0 || running) return;

    setError(null);
    abortRef.current = false;
    setRunning(true);

    setGenStates((prev) => {
      const next = { ...prev };
      for (const id of targetIds) next[id] = { status: 'queued' };
      return next;
    });

    for (const topicId of targetIds) {
      if (abortRef.current) {
        setGenStates((prev) => ({
          ...prev,
          [topicId]: { status: 'idle', message: 'Dayandırıldı' },
        }));
        continue;
      }

      setGenStates((prev) => ({ ...prev, [topicId]: { status: 'running' } }));

      try {
        const result = await generateTopicMaterialAction(topicId);

        if (!result.ok) {
          setGenStates((prev) => ({
            ...prev,
            [topicId]: { status: 'error', message: result.error },
          }));
          continue;
        }

        setGenStates((prev) => ({
          ...prev,
          [topicId]: {
            status: 'done',
            questionsCreated: result.data.questionsCreated,
            belowPoolMinimum: result.data.belowPoolMinimum,
            missingChunkCount: result.data.missingChunkCount,
          },
        }));
      } catch (e) {
        // A network drop / function timeout on ONE topic must not abort the
        // run — the remaining topics are still independently generatable.
        setGenStates((prev) => ({
          ...prev,
          [topicId]: {
            status: 'error',
            message: e instanceof Error ? e.message : 'Şəbəkə xətası',
          },
        }));
      }
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
  }

  const ungenerated = topics.filter((t) => t.content === null || t.questionCount === 0);
  const failedIds = Object.entries(genStates)
    .filter(([, s]) => s.status === 'error')
    .map(([id]) => id);
  const doneCount = Object.values(genStates).filter((s) => s.status === 'done').length;
  const totalQueued = Object.values(genStates).filter((s) => s.status !== 'idle').length;
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
                  Generasiya gedir — {doneCount}/{totalQueued} tamamlandı. Səhifəni bağlamayın.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {topics.length === 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  isPending={proposing}
                  isDisabled={proposing}
                  onPress={() => void handlePropose()}
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner size="sm" tone="current" /> : null}
                      Mövzuları təklif et
                    </>
                  )}
                </Button>
              )}

              {ungenerated.length > 0 && !running && (
                <Button
                  variant="primary"
                  size="sm"
                  onPress={() => void runGeneration(ungenerated.map((t) => t.id))}
                >
                  {ungenerated.length} mövzu üçün material yarat
                </Button>
              )}

              {failedIds.length > 0 && !running && (
                <Button
                  variant="outline"
                  size="sm"
                  onPress={() => void runGeneration(failedIds)}
                >
                  {failedIds.length} uğursuzu təkrarla
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

          {running && totalQueued > 0 && (
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.round((doneCount / totalQueued) * 100)}%` }}
              />
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
                Bu kursda hələ mövzu yoxdur. «Mövzuları təklif et» ilə sənədin bölmə sərhədlərindən
                mövzu layihələri qurun.
              </div>
            ) : (
              topics.map((topic, index) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  index={index}
                  gen={genStates[topic.id]}
                  isRunLocked={running}
                  onGenerate={() => void runGeneration([topic.id])}
                  onPublish={() => void handlePublishTopic(topic)}
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
