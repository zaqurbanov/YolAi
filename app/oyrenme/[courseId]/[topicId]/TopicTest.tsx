'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert, Button, Chip, Radio, RadioGroup } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { Spinner } from '@/components/Spinner';
import { CheckIcon, CloseIcon, CoinIcon, LockIcon } from '@/components/icons';
import {
  startTopicAttemptAction,
  submitTopicAttemptAction,
  type StartTopicAttemptState,
  type SubmitTopicAttemptState,
} from '../../actions';
import RetryPurchaseDialog from './RetryPurchaseDialog';

// Question/review shapes are derived from the action states rather than
// imported from lib/quiz/topicTest — that module is 'server-only', and this is
// the client half of the same contract.
type DrawnQuestion = NonNullable<StartTopicAttemptState['questions']>[number];
type AnswerReview = NonNullable<SubmitTopicAttemptState['perQuestion']>[number];

interface TopicTestProps {
  courseId: string;
  topicId: string;
  /** 0 means the pool is too small for a test to exist at all. */
  testSize: number;
  passThreshold: number;
  canAttemptToday: boolean;
  hasUnusedRetry: boolean;
  /** Display only — purchaseRetryAction resolves the real price server-side. */
  retryCost: number;
  balance: number | null;
  passed: boolean;
  bestScore: number;
  attempts: number;
}

// The test is a PHASE of the topic route, not a route of its own: a separate
// /test page would cost another Vercel function (the deployment is already well
// past the Hobby cap — see CLAUDE.md) and would have to carry the drawn
// question set plus its signed token across a navigation.
//
// Nothing about the outcome is computed here. The client holds the opaque token
// and the selected indexes; the score, the pass flag, the threshold and the
// answer key all come back from submitTopicAttemptAction. correctIndex and
// explanation only ever exist in this component AFTER submission.
export default function TopicTest({
  courseId,
  topicId,
  testSize,
  passThreshold,
  canAttemptToday,
  hasUnusedRetry,
  retryCost,
  balance,
  passed,
  bestScore,
  attempts,
}: TopicTestProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [questions, setQuestions] = useState<DrawnQuestion[] | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [liveThreshold, setLiveThreshold] = useState(passThreshold);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<SubmitTopicAttemptState | null>(null);
  const [notice, setNotice] = useState<{ tone: 'danger' | 'warning'; message: string } | null>(null);
  const [retryOpen, setRetryOpen] = useState(false);
  // Local override: a purchased retry re-opens the test immediately, without
  // waiting for the server-rendered canAttemptToday to come back.
  const [retryUnlocked, setRetryUnlocked] = useState(false);

  const canAttempt = canAttemptToday || retryUnlocked;
  const phase = result ? 'result' : questions ? 'running' : 'idle';
  const answeredCount = questions
    ? questions.filter((q) => answers[q.id] !== undefined).length
    : 0;

  function resetToIdle() {
    setQuestions(null);
    setToken(null);
    setAnswers({});
    setResult(null);
  }

  function handleStart() {
    if (isPending) return;
    setNotice(null);
    startTransition(async () => {
      const res = await startTopicAttemptAction(topicId);

      if (res.status === 'success' && res.questions && res.token) {
        setQuestions(res.questions);
        setToken(res.token);
        setAnswers({});
        setResult(null);
        if (typeof res.passThreshold === 'number') setLiveThreshold(res.passThreshold);
        return;
      }

      if (res.status === 'daily_limit_reached') {
        setRetryUnlocked(false);
        setNotice({ tone: 'warning', message: res.message });
        setRetryOpen(true);
        return;
      }

      if (res.status === 'unauthenticated') {
        router.push('/login');
        return;
      }

      setNotice({ tone: res.status === 'no_questions' ? 'warning' : 'danger', message: res.message });
    });
  }

  function handleSubmit() {
    if (isPending || !questions || !token) return;
    setNotice(null);
    startTransition(async () => {
      // Every drawn question must appear exactly once; an untouched one is sent
      // as -1 (scored wrong) rather than omitted, which the action rejects.
      const res = await submitTopicAttemptAction({
        topicId,
        token,
        answers: questions.map((q) => ({
          questionId: q.id,
          selectedIndex: answers[q.id] ?? -1,
        })),
      });

      if (res.status === 'success') {
        setResult(res);
        setRetryUnlocked(false);
        router.refresh();
        return;
      }

      if (res.status === 'expired_token') {
        resetToIdle();
        setNotice({
          tone: 'warning',
          message: 'Testin vaxtı bitdi (45 dəqiqə). Testi yenidən başladın.',
        });
        return;
      }

      if (res.status === 'invalid_token' || res.status === 'invalid_answers') {
        resetToIdle();
        setNotice({ tone: 'danger', message: `${res.message}` });
        return;
      }

      if (res.status === 'daily_limit_reached') {
        resetToIdle();
        setRetryUnlocked(false);
        setNotice({ tone: 'warning', message: res.message });
        setRetryOpen(true);
        return;
      }

      if (res.status === 'unauthenticated') {
        router.push('/login');
        return;
      }

      setNotice({ tone: 'danger', message: res.message });
    });
  }

  const reviewById = new Map<string, AnswerReview>(
    (result?.perQuestion ?? []).map((r) => [r.questionId, r])
  );

  return (
    <section className="glass-panel rounded-2xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <CheckIcon width={18} height={18} />
          </span>
          <h2 className="text-headline-md text-[18px]">Mövzu testi</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {passed && (
            <Chip size="sm" variant="soft" color="success" className="mono-label">
              Keçilib
            </Chip>
          )}
          {attempts > 0 && (
            <span className="text-legal-citation text-on-surface-variant">
              {attempts} cəhd • ən yaxşı {bestScore}
            </span>
          )}
        </div>
      </div>

      {notice && (
        <Alert status={notice.tone} className="mb-4">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{notice.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {/* ---------------------------------------------------------------- idle */}
      {phase === 'idle' && (
        <>
          {testSize === 0 ? (
            <p className="text-body-md text-on-surface-variant">
              Bu mövzu üçün test hələ hazır deyil. Materialı oxuya bilərsiniz, test əlavə olunduqda
              burada görünəcək.
            </p>
          ) : (
            <>
              <p className="text-body-md text-on-surface-variant">
                Testdə <span className="font-semibold text-on-surface">{testSize} sual</span> var.
                Keçmək üçün ən azı{' '}
                <span className="font-semibold text-go-green">{passThreshold} düzgün cavab</span>{' '}
                lazımdır. Gündə bir pulsuz cəhd.
              </p>

              {canAttempt ? (
                <Button
                  className="glow-primary mt-5 w-full sm:w-auto"
                  variant="primary"
                  isPending={isPending}
                  isDisabled={isPending}
                  onPress={handleStart}
                >
                  {({ isPending: pending }) => (
                    <>
                      {pending ? <Spinner size="sm" tone="current" /> : null}
                      {hasUnusedRetry ? 'Təkrar cəhdlə testə başla' : 'Testə başla'}
                    </>
                  )}
                </Button>
              ) : (
                <div className="mt-5 rounded-2xl border border-outline-variant/40 p-4">
                  <p className="flex items-center gap-2 text-label-sm text-on-surface-variant">
                    <LockIcon width={15} height={15} />
                    Bugünkü pulsuz cəhdinizi istifadə etmisiniz. Sabah yenisi açılır.
                  </p>
                  <Button
                    className="mt-3 w-full sm:w-auto"
                    variant="outline"
                    onPress={() => setRetryOpen(true)}
                  >
                    <CoinIcon width={15} height={15} />
                    Təkrar cəhd al ({retryCost} coin)
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ------------------------------------------------------------- running */}
      {phase === 'running' && questions && (
        <>
          <div className="mb-5">
            <div className="mb-2 flex items-center justify-between text-label-sm text-on-surface-variant">
              <span>Cavablandırılıb</span>
              <span>
                {answeredCount}/{questions.length}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.round((answeredCount / questions.length) * 100)}%` }}
              />
            </div>
          </div>

          <ol className="flex flex-col gap-6">
            {questions.map((question, index) => (
              <li key={question.id} className="rounded-2xl border border-outline-variant/40 p-4">
                <p className="mb-3 text-body-md text-on-surface">
                  <span className="text-legal-citation mr-2 text-primary">{index + 1}</span>
                  {question.question}
                </p>
                <RadioGroup
                  aria-label={`Sual ${index + 1}`}
                  value={answers[question.id] !== undefined ? String(answers[question.id]) : undefined}
                  onChange={(value) =>
                    setAnswers((prev) => ({ ...prev, [question.id]: Number(value) }))
                  }
                  isDisabled={isPending}
                >
                  {question.options.map((option, optionIndex) => (
                    <Radio key={optionIndex} value={String(optionIndex)}>
                      <Radio.Content>
                        <Radio.Control>
                          <Radio.Indicator />
                        </Radio.Control>
                        {option}
                      </Radio.Content>
                    </Radio>
                  ))}
                </RadioGroup>
              </li>
            ))}
          </ol>

          {answeredCount < questions.length && (
            <p className="mt-4 text-label-sm text-safety-yellow">
              Cavablanmamış suallar səhv sayılacaq.
            </p>
          )}

          <Button
            className="glow-primary mt-4 w-full sm:w-auto"
            variant="primary"
            isPending={isPending}
            isDisabled={isPending}
            onPress={handleSubmit}
          >
            {({ isPending: pending }) => (
              <>
                {pending ? <Spinner size="sm" tone="current" /> : null}
                Testi bitir
              </>
            )}
          </Button>
        </>
      )}

      {/* -------------------------------------------------------------- result */}
      {phase === 'result' && result && (
        <>
          <div
            className={`rounded-2xl border p-5 ${
              result.passed
                ? 'border-go-green/30 bg-go-green/5'
                : 'border-caution-orange/30 bg-caution-orange/5'
            }`}
          >
            <p
              className={`text-headline-md text-[20px] ${result.passed ? 'text-go-green' : 'text-caution-orange'}`}
            >
              {result.passed ? 'Təbriklər, mövzunu keçdiniz' : 'Bu dəfə alınmadı'}
            </p>
            <p className="mt-1 text-body-md text-on-surface">
              {result.score}/{result.total} düzgün cavab • keçid həddi{' '}
              {result.passThreshold ?? liveThreshold}
            </p>
            <p className="mt-1 text-label-sm text-on-surface-variant">
              Ən yaxşı nəticə: {result.bestScore} • {result.attempts} cəhd
              {result.usedRetry ? ' • təkrar cəhd istifadə olundu' : ''}
            </p>
          </div>

          {result.unlockedTopicId && (
            <div className="glow-primary mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
              <p className="text-label-sm text-primary">Növbəti mövzu açıldı</p>
              <p className="mt-1 text-body-md text-on-surface">{result.unlockedTopicTitle}</p>
              <Link
                href={`/oyrenme/${courseId}/${result.unlockedTopicId}`}
                className={buttonVariants({ variant: 'primary', size: 'sm' }) + ' mt-3'}
              >
                Növbəti mövzuya keç
              </Link>
            </div>
          )}

          <h3 className="mt-6 mb-3 text-headline-md text-[18px]">Cavabların təhlili</h3>
          <ol className="flex flex-col gap-4">
            {(questions ?? []).map((question, index) => {
              const review = reviewById.get(question.id);
              const isCorrect = review ? review.selectedIndex === review.correctIndex : false;

              return (
                <li
                  key={question.id}
                  className={`rounded-2xl border p-4 ${
                    isCorrect ? 'border-go-green/30' : 'border-error/30'
                  }`}
                >
                  <div className="mb-3 flex items-start gap-2">
                    <span
                      className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
                        isCorrect ? 'bg-go-green/15 text-go-green' : 'bg-error/15 text-error'
                      }`}
                    >
                      {isCorrect ? (
                        <CheckIcon width={12} height={12} />
                      ) : (
                        <CloseIcon width={12} height={12} />
                      )}
                    </span>
                    <p className="text-body-md text-on-surface">
                      <span className="text-legal-citation mr-2 text-primary">{index + 1}</span>
                      {question.question}
                    </p>
                  </div>

                  <ul className="flex flex-col gap-1.5">
                    {question.options.map((option, optionIndex) => {
                      const isAnswer = review?.correctIndex === optionIndex;
                      const isChosen = review?.selectedIndex === optionIndex;
                      return (
                        <li
                          key={optionIndex}
                          className={`rounded-xl px-3 py-2 text-label-sm ${
                            isAnswer
                              ? 'bg-go-green/10 text-go-green'
                              : isChosen
                                ? 'bg-error/10 text-error'
                                : 'text-on-surface-variant'
                          }`}
                        >
                          {option}
                          {isAnswer && <span className="ml-2">— düzgün cavab</span>}
                          {isChosen && !isAnswer && <span className="ml-2">— sizin cavabınız</span>}
                        </li>
                      );
                    })}
                  </ul>

                  {review?.explanation && (
                    <p className="mt-3 rounded-xl bg-surface-secondary/60 px-3 py-2 text-label-sm text-on-surface-variant">
                      {review.explanation}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="mt-6 flex flex-wrap gap-2">
            <Button variant="outline" onPress={resetToIdle}>
              Testi bağla
            </Button>
            <Link
              href={`/oyrenme/${courseId}`}
              className={buttonVariants({ variant: 'ghost', size: 'md' })}
            >
              Kursa qayıt
            </Link>
          </div>
        </>
      )}

      <RetryPurchaseDialog
        topicId={topicId}
        price={retryCost}
        balance={balance}
        isOpen={retryOpen}
        onOpenChange={setRetryOpen}
        onPurchased={() => {
          setRetryUnlocked(true);
          setNotice(null);
        }}
      />
    </section>
  );
}
