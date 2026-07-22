import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Chip } from '@heroui/react';
import { createClient } from '@/lib/supabase/server';
import Footer from '@/components/Footer';
import LessonMarkdown from '@/components/LessonMarkdown';
import { ArrowLeftIcon, ArrowRightIcon, DocumentIcon } from '@/components/icons';
import { getTopicForReading } from '@/lib/quiz/topicTest';
import { getCoinBalanceStatus } from '@/lib/chat/coins';
import TopicTest from './TopicTest';

export const metadata: Metadata = {
  title: 'Mövzu',
};

// Topic page: reading material + the test, the test being a client-side PHASE
// of this route (idle -> in-progress -> result) rather than a third route.
// Two reasons: the deployment is already past Vercel Hobby's function budget
// (CLAUDE.md), and a /test route would have to carry a drawn question set and
// its signed token across a navigation.
//
// params is a Promise in Next.js 16 (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md).
export default async function TopicPage({
  params,
}: {
  params: Promise<{ courseId: string; topicId: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { courseId, topicId } = await params;

  // getTopicForReading runs THE gate internally (resolveAccessibleTopic:
  // published topic -> canAccessCourse on the topic's own course_id -> the
  // sequential unlock rule) and returns null for "no such topic" and "not
  // allowed" alike. Both render the same 404 — the distinction is deliberately
  // not observable.
  const topic = await getTopicForReading(topicId, user.id);
  if (!topic) notFound();

  // The route's courseId is decoration; the authoritative course is the one the
  // topic row belongs to. A mismatched pair is a 404 rather than a page that
  // silently renders under the wrong course's breadcrumb.
  if (topic.courseId !== courseId) notFound();

  // Display only — purchaseRetryAction re-reads and charges its own. Fails open
  // to null, which renders as "—" in the retry dialog.
  const balance = await getCoinBalanceStatus(user.id)
    .then((s) => s.balance)
    .catch(() => null);

  return (
    <div id="top" className="flex flex-1 flex-col">
      <section className="relative overflow-hidden px-6 pt-10 pb-6">
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="relative z-10 mx-auto flex max-w-3xl flex-col gap-4">
          <nav className="flex flex-wrap items-center gap-1.5 text-label-sm text-on-surface-variant">
            <Link href="/oyrenme" className="transition-colors hover:text-primary">
              Kurslar
            </Link>
            <span aria-hidden>/</span>
            <Link
              href={`/oyrenme/${topic.courseId}`}
              className="inline-flex items-center gap-1.5 transition-colors hover:text-primary"
            >
              <ArrowLeftIcon width={14} height={14} />
              {topic.courseTitle || 'Kurs'}
            </Link>
          </nav>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-legal-citation rounded-full bg-primary/15 px-3 py-1 text-primary">
              Mövzu {topic.orderIndex + 1}
            </span>
            {topic.passed && (
              <Chip size="sm" variant="soft" color="success" className="mono-label">
                Keçilib • ən yaxşı {topic.bestScore}
              </Chip>
            )}
          </div>

          <h1 className="text-display-lg text-[30px] text-balance lg:text-[38px]">{topic.title}</h1>
        </div>
      </section>

      <section className="px-6 pb-10">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          <article className="glass-card rounded-2xl p-6 lg:p-8">
            {topic.content ? (
              <LessonMarkdown content={topic.content} />
            ) : (
              <p className="text-body-md text-on-surface-variant">
                Bu mövzunun mətni hələ hazır deyil.
              </p>
            )}

            {topic.sourceCitations.length > 0 && (
              <div className="mt-8 border-t border-outline-variant/40 pt-4">
                <p className="text-legal-citation mb-2 text-on-surface-variant">Mənbələr</p>
                <ul className="flex flex-wrap gap-2">
                  {topic.sourceCitations.map((citation, i) => (
                    <li
                      key={citation.chunkId ?? i}
                      className="text-legal-citation inline-flex items-center gap-1.5 rounded-full bg-surface-secondary/60 px-3 py-1 text-on-surface-variant"
                    >
                      <DocumentIcon width={13} height={13} />
                      {citation.articleLabel ?? 'Qaydalar'}
                      {citation.pageNumber != null && ` • səh. ${citation.pageNumber}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>

          <TopicTest
            courseId={topic.courseId}
            topicId={topic.id}
            testSize={topic.testSize}
            passThreshold={topic.passThreshold}
            canAttemptToday={topic.canAttemptToday}
            hasUnusedRetry={topic.hasUnusedRetry}
            retryCost={topic.retryCost}
            balance={balance}
            passed={topic.passed}
            bestScore={topic.bestScore}
            attempts={topic.attempts}
          />

          <nav className="flex flex-wrap items-center justify-between gap-3">
            {topic.prevTopicId ? (
              <Link
                href={`/oyrenme/${topic.courseId}/${topic.prevTopicId}`}
                className="glass-card inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-label-sm transition-colors hover:text-primary"
              >
                <ArrowLeftIcon width={16} height={16} />
                Əvvəlki mövzu
              </Link>
            ) : (
              <span />
            )}

            {/* The next topic is only reachable once THIS one is passed — the
                sequential unlock rule is enforced server-side either way, so an
                unpassed topic gets no link at all rather than a dead one. */}
            {topic.nextTopicId && topic.passed ? (
              <Link
                href={`/oyrenme/${topic.courseId}/${topic.nextTopicId}`}
                className="glass-card inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-label-sm transition-colors hover:text-primary"
              >
                Növbəti mövzu
                <ArrowRightIcon width={16} height={16} />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </div>
      </section>

      <Footer />
    </div>
  );
}
