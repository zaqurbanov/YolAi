'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, toast } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import Footer from '@/components/Footer';
import { Spinner } from '@/components/Spinner';
import {
  startExamSessionAction,
  submitExamSessionAction,
  type StartExamState,
} from '@/app/coin-qazan/actions';
import type { ExamQuestion } from '@/lib/exam/examPool';
import type { ExamHistorySummary } from '@/lib/exam/examHistory';
import {
  ArrowRightIcon,
  ArrowLeftIcon,
  CheckIcon,
  CloseIcon,
  ClockIcon,
  CoinIcon,
  RulesIcon,
  TrophyIcon,
  LockIcon,
} from '@/components/icons';
import { answerExamQuestionAction } from './actions';

// Must match the exam's advertised length. The server enforces a SEPARATE,
// longer hard limit (exam_session_ttl_seconds, default 1200s = 20 min) so a
// slow network can't void a legitimately-finished exam — this 15-minute clock
// is the exam-room rule, that TTL is the anti-abuse backstop. See
// 0082_exam_simulator.sql.
const EXAM_DURATION_MS = 15 * 60_000;
const QUESTION_COUNT = 10;

// The landing shows the COIN entry price — since 0094 the exam is coin-only
// (0095 removed the energy path end-to-end; examPricing.ts returns coinPrice,
// and startExamSessionAction charges coins). This UI used to render an energy
// cost that the backend never charged, so the afford gate and the price line
// lied about the actual currency.
interface OfficialExamClientProps {
  coinBalance: number;
  coinPrice: number;
  passThreshold: number;
  history: ExamHistorySummary;
  // Admins sit the exam for free (startExamSessionAction charges p_coin_price:
  // 0 server-side for them), so the coin gate/price line are bypassed.
  isAdmin: boolean;
}

// The two modes on the roadmap but not built. Shown as real cards rather than
// hidden, so the page communicates where it is going — locked, not fake.
const LOCKED_MODES = [
  {
    title: 'Öyrənmə Rejimi',
    desc: 'Vaxt məhdudiyyəti olmadan, hər sualın izahı ilə birlikdə.',
    icon: RulesIcon,
    tone: 'bg-sand/45',
  },
  {
    title: 'Zəif Nöqtələr',
    desc: 'Əvvəlki imtahanlarda səhv etdiyin suallar üzərində cəmləş.',
    icon: TrophyIcon,
    tone: 'bg-sage/30',
  },
];

type Phase = 'idle' | 'running' | 'finished';

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function OfficialExamClient({
  coinBalance,
  coinPrice,
  passThreshold,
  history,
  isAdmin,
}: OfficialExamClientProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [coins, setCoins] = useState(coinBalance);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  // Verdicts come from the server, one per answered question (0091). null =
  // not answered yet. The correct index itself is never held client-side.
  const [verdicts, setVerdicts] = useState<(boolean | null)[]>([]);
  const [isAnswering, setIsAnswering] = useState(false);
  const [current, setCurrent] = useState(0);
  const [remainingMs, setRemainingMs] = useState(EXAM_DURATION_MS);
  const [isStarting, setIsStarting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);

  const deadlineRef = useRef<number | null>(null);
  // Guards the timeout path against racing the manual-submit path — without
  // it, hitting "Bitir" in the final second could fire settle twice and the
  // second call would come back `already_used`.
  const submittedRef = useRef(false);

  const finish = useCallback(
    async (finalAnswers: (number | null)[]) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setIsSubmitting(true);
      deadlineRef.current = null;

      // Unanswered questions are submitted as 0 rather than -1: the server
      // rejects out-of-range answers outright (settle_exam_session raises
      // invalid_answers), so a blank must still be a legal index. It counts as
      // wrong unless 0 happens to be correct — the same convention the games
      // simulator uses.
      const payload = finalAnswers.map((a) => (a == null ? 0 : a));

      try {
        const res = await submitExamSessionAction(sessionId ?? '', payload);
        if (res.status === 'success') {
          setResult({ score: res.score ?? 0, total: res.total ?? QUESTION_COUNT });
          setPhase('finished');
        } else {
          toast.danger(res.message);
          // The spend already happened at start and is not refundable, so the
          // user is returned to the landing screen rather than left stuck in a
          // dead exam room.
          setPhase('idle');
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [sessionId],
  );

  // Single interval driving the countdown. Deliberately derives remaining time
  // from an absolute deadline rather than decrementing a counter, so a
  // backgrounded tab (where timers are throttled) resumes with the CORRECT
  // remaining time instead of a stale one.
  useEffect(() => {
    if (phase !== 'running' || deadlineRef.current == null) return;

    const tick = () => {
      const deadline = deadlineRef.current;
      if (deadline == null) return;
      const left = deadline - Date.now();
      setRemainingMs(left);
      if (left <= 0) {
        setAnswers((currentAnswers) => {
          void finish(currentAnswers);
          return currentAnswers;
        });
      }
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [phase, finish]);

  // One shot per question: the server locks the first answer and returns the
  // verdict, so re-tapping a different option after answering does nothing.
  // That lock is not a UI nicety — it is what stops the true/false response
  // from being brute-forced into the answer key (see 0091's header).
  async function selectAnswer(optionIndex: number) {
    if (answers[current] != null || isAnswering || !sessionId) return;
    setIsAnswering(true);
    try {
      const res = await answerExamQuestionAction(sessionId, current, optionIndex);
      if (res.status !== 'success') {
        toast.danger(res.message);
        if (res.status === 'session_expired' || res.status === 'already_used') {
          void finish(answers);
        }
        return;
      }
      const locked = res.locked ?? optionIndex;
      setAnswers((prev) => prev.map((a, i) => (i === current ? locked : a)));
      setVerdicts((prev) => prev.map((v, i) => (i === current ? Boolean(res.correct) : v)));
    } finally {
      setIsAnswering(false);
    }
  }

  async function start() {
    setIsStarting(true);
    try {
      const res: StartExamState = await startExamSessionAction();
      if (res.status !== 'success' || !res.questions || !res.sessionId) {
        toast.danger(res.message);
        return;
      }
      submittedRef.current = false;
      setQuestions(res.questions);
      setSessionId(res.sessionId);
      setAnswers(Array.from({ length: res.questions.length }, () => null));
      setVerdicts(Array.from({ length: res.questions.length }, () => null));
      setCurrent(0);
      setResult(null);
      if (typeof res.balance === 'number') setCoins(res.balance);
      deadlineRef.current = Date.now() + EXAM_DURATION_MS;
      setRemainingMs(EXAM_DURATION_MS);
      setPhase('running');
    } finally {
      setIsStarting(false);
    }
  }

  // ---------------------------------------------------------------- exam room
  if (phase === 'running' && questions.length > 0) {
    const question = questions[current];
    const answeredCount = answers.filter((a) => a != null).length;
    const timeProgress = Math.max(0, Math.min(100, (remainingMs / EXAM_DURATION_MS) * 100));
    const isLow = remainingMs <= 60_000;
    const hasOptionImages = question.optionImageUrls != null;
    const currentVerdict = verdicts[current];
    const isLocked = answers[current] != null;

    return (
      // No bottom tab bar and no exit link on purpose: this is meant to feel
      // like a real exam room. The only ways out are finishing or the timer.
      <div className="editorial flex min-h-full flex-col bg-background">
        <header className="sticky top-0 z-20 border-b border-outline-variant/40 bg-surface/85 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-5 py-3">
            <div>
              <p className="text-legal-citation text-on-surface-variant">
                Sual {current + 1} / {questions.length}
              </p>
              <p className="text-label-sm font-semibold text-on-surface">
                {answeredCount} cavablanıb
              </p>
            </div>
            <div
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 tabular-nums ${
                isLow
                  ? 'bg-danger/12 text-danger'
                  : 'bg-primary/10 text-primary'
              }`}
              role="timer"
              aria-live="off"
            >
              <ClockIcon width={16} height={16} />
              <span className="text-[17px] font-extrabold">{formatTime(remainingMs)}</span>
            </div>
          </div>
          <div className="h-1 w-full bg-surface-secondary">
            <div
              className={`h-full transition-[width] duration-1000 ease-linear ${
                isLow ? 'bg-danger' : 'bg-primary'
              }`}
              style={{ width: `${timeProgress}%` }}
            />
          </div>
        </header>

        <div className="mx-auto w-full max-w-3xl flex-1 px-5 py-6">
          {/* Question-number strip — lets the candidate jump around and see at a
              glance what is still blank, like a real exam answer sheet. */}
          {/* Answer sheet. Once a question is answered the server's verdict is
              shown here as a tick or a cross — the box stops being a number and
              becomes the result. Only visited/answered questions are
              navigable; jumping ahead would bypass the answer requirement. */}
          <div className="mb-6 flex flex-wrap gap-1.5">
            {questions.map((_, i) => {
              const verdict = verdicts[i];
              const isAnswered = answers[i] != null;
              const reachable = isAnswered || i <= current;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => reachable && setCurrent(i)}
                  disabled={!reachable}
                  aria-label={
                    verdict == null
                      ? `Sual ${i + 1}`
                      : `Sual ${i + 1} — ${verdict ? 'düzgün' : 'səhv'}`
                  }
                  aria-current={i === current ? 'true' : undefined}
                  className={`flex size-8 items-center justify-center rounded-lg text-label-sm font-bold transition ${
                    verdict === true
                      ? 'bg-go-green text-white'
                      : verdict === false
                        ? 'bg-danger text-white'
                        : i === current
                          ? 'bg-primary text-on-primary'
                          : reachable
                            ? 'bg-surface-secondary text-on-surface-variant'
                            : 'bg-surface-secondary text-on-surface-variant/40'
                  } ${i === current && verdict != null ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
                >
                  {verdict === true ? (
                    <CheckIcon width={16} height={16} strokeWidth={3} />
                  ) : verdict === false ? (
                    <CloseIcon width={16} height={16} strokeWidth={3} />
                  ) : (
                    i + 1
                  )}
                </button>
              );
            })}
          </div>

          {question.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- Supabase public storage URL, dynamic per question, not next/image-eligible.
            <img
              src={question.imageUrl}
              alt="İmtahan sualının şəkli"
              className="mb-5 max-h-[320px] w-full rounded-2xl border border-outline-variant/40 bg-surface object-contain"
            />
          )}

          <h1 className="mb-5 text-[20px] font-semibold leading-snug text-on-surface">
            {question.question}
          </h1>

          <div className={hasOptionImages ? 'grid grid-cols-2 gap-3' : 'space-y-3'}>
            {question.options.map((option, i) => {
              const isSelected = answers[current] === i;
              const optionImage = question.optionImageUrls?.[i] ?? null;
              // Only the chosen option is coloured by the verdict. The correct
              // option is NOT revealed when the answer was wrong — the server
              // never tells the client which one it was.
              const tone =
                isSelected && currentVerdict === true
                  ? 'border-go-green bg-go-green/10 ring-1 ring-go-green/40'
                  : isSelected && currentVerdict === false
                    ? 'border-danger bg-danger/10 ring-1 ring-danger/40'
                    : isSelected
                      ? 'border-primary bg-primary/8 ring-1 ring-primary/40'
                      : isLocked
                        ? 'border-outline-variant/30 opacity-55'
                        : 'border-outline-variant/40 hover:border-primary/50 hover:bg-primary/5';
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => void selectAnswer(i)}
                  disabled={isLocked || isAnswering}
                  aria-pressed={isSelected}
                  className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition disabled:cursor-default ${tone} ${
                    hasOptionImages ? 'flex-col items-stretch' : ''
                  }`}
                >
                  {optionImage && (
                    // eslint-disable-next-line @next/next/no-img-element -- Supabase public storage URL, dynamic per option.
                    <img
                      src={optionImage}
                      alt=""
                      className="mb-2 h-24 w-full rounded-lg bg-surface object-contain"
                    />
                  )}
                  <span className="flex items-center gap-3">
                    <span
                      className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${
                        isSelected && currentVerdict === true
                          ? 'border-go-green bg-go-green text-white'
                          : isSelected && currentVerdict === false
                            ? 'border-danger bg-danger text-white'
                            : isSelected
                              ? 'border-primary bg-primary text-on-primary'
                              : 'border-outline-variant text-on-surface-variant'
                      }`}
                    >
                      {isSelected && currentVerdict === true ? (
                        <CheckIcon width={12} height={12} strokeWidth={3} />
                      ) : isSelected && currentVerdict === false ? (
                        <CloseIcon width={12} height={12} strokeWidth={3} />
                      ) : (
                        ['A', 'B', 'C', 'D'][i]
                      )}
                    </span>
                    <span className="text-body-md text-on-surface">{option}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-outline-variant/40 bg-surface/90 backdrop-blur-xl">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-5 py-3">
            <Button
              variant="outline"
              onPress={() => setCurrent((i) => Math.max(0, i - 1))}
              isDisabled={current === 0}
              isIconOnly
              aria-label="Əvvəlki sual"
              className="rounded-full"
            >
              <ArrowLeftIcon width={18} height={18} />
            </Button>
            {/* Advancing requires an answer. The button reports WHY it is
                disabled rather than just sitting dead. */}
            {current < questions.length - 1 ? (
              <Button
                variant="primary"
                onPress={() => setCurrent((i) => Math.min(questions.length - 1, i + 1))}
                isDisabled={!isLocked || isAnswering}
                className="glow-primary flex-1 gap-2 rounded-full border-0 text-white disabled:opacity-45"
              >
                {isAnswering ? <Spinner size="sm" tone="current" /> : null}
                {isLocked ? 'Növbəti' : 'Cavab seçin'}
                {isLocked && <ArrowRightIcon width={16} height={16} />}
              </Button>
            ) : (
              <Button
                variant="primary"
                onPress={() => void finish(answers)}
                isDisabled={!isLocked || isAnswering}
                isPending={isSubmitting}
                className="glow-primary flex-1 gap-2 rounded-full border-0 text-white disabled:opacity-45"
              >
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner size="sm" tone="current" /> : null}
                    {isLocked ? 'İmtahanı bitir' : 'Cavab seçin'}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------- result
  if (phase === 'finished' && result) {
    const passed = result.score >= passThreshold;
    return (
      <div className="editorial flex flex-col pb-24">
        <div className="mx-auto w-full max-w-2xl px-5 py-10">
          <div
            className="editorial-shadow relative overflow-hidden rounded-[2rem] border border-border/40 bg-surface p-8 text-center"
          >
            <div
              aria-hidden
              className={`pointer-events-none absolute -right-16 -top-16 size-56 rounded-full blur-3xl ${
                passed ? 'bg-go-green/20' : 'bg-danger/15'
              }`}
            />
            <div className="relative z-10">
              <div
                className={`mx-auto mb-5 flex size-16 items-center justify-center rounded-full ${
                  passed ? 'bg-secondary-container/60 text-on-secondary-container' : 'bg-danger/12 text-danger'
                }`}
              >
                {passed ? <TrophyIcon width={30} height={30} /> : <RulesIcon width={30} height={30} />}
              </div>
              <p className="text-legal-citation text-on-surface-variant">Nəticə</p>
              <p className="mt-1 text-6xl font-bold tabular-nums text-primary">
                {result.score}
                <span className="text-3xl text-on-surface-variant">/{result.total}</span>
              </p>
              <h1 className="mt-4 text-headline-md text-on-surface">
                {passed ? 'Təbriklər, imtahandan keçdin!' : 'Bu dəfə alınmadı'}
              </h1>
              <p className="mt-2 text-body-md text-on-surface-variant">
                {passed
                  ? `Keçid həddi ${passThreshold}/${result.total}. Real imtahana hazırsan.`
                  : `Keçid üçün ${passThreshold}/${result.total} lazımdır. Dərsləri təkrarlayıb yenidən cəhd et.`}
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button
                  variant="primary"
                  onPress={() => {
                    setPhase('idle');
                    setResult(null);
                  }}
                  className="glow-primary gap-2 rounded-full border-0 text-white"
                >
                  Yenidən cəhd et
                </Button>
                <Link
                  href="/oyrenme"
                  className={`${buttonVariants({ variant: 'outline', size: 'md' })} rounded-full border-primary/30 text-primary`}
                >
                  Dərslərə qayıt
                </Link>
              </div>
            </div>
          </div>

          {/* Deliberately NOT showing which questions were wrong: the server
              never sends correct_index to the client (see examPool.ts), and
              round-tripping it back after grading would put the whole answer
              key in the browser for anyone who replays the request. */}
          <p className="mt-4 text-center text-legal-citation text-on-surface-variant">
            Düzgün cavablar göstərilmir — hər imtahan yeni suallarla qurulur.
          </p>
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------ landing
  const canAffordCoins = coins >= coinPrice;
  const lastPct =
    history.lastScore != null && history.lastTotal
      ? Math.round((history.lastScore / history.lastTotal) * 100)
      : null;

  return (
    // No `overflow-hidden` on this root: it is a flex ITEM of the app-wide
    // scroller (<main> in app/layout.tsx), and `overflow: hidden` swaps a flex
    // item's automatic minimum size from content-based to 0 — which let it
    // shrink to the viewport and clip everything below the fold. Decorative
    // clipping belongs on the individual cards, which already carry it.
    <div className="editorial relative flex flex-1 flex-col pb-24">
      <div className="relative z-10 mx-auto w-full max-w-[1280px] px-5 pt-8 md:px-12 md:pt-14">
        {/* Split hero. Left: the pitch. Right: the user's own last result as a
            circular badge — the export's centrepiece, and the one number that
            makes the page personal rather than promotional. */}
        <section className="grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-primary">
              Rəsmi format
            </span>
            <h1 className="mt-4 max-w-2xl text-[32px] font-semibold leading-[1.15] tracking-tight text-navy md:text-[44px]">
              Sürücülük imtahanına <span className="italic text-primary">real</span> hazırlıq
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-on-surface-variant">
              {QUESTION_COUNT} sual, 15 dəqiqə, geri sayım. Suallar hər dəfə yenidən seçilir və
              nəticə serverdə hesablanır.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                variant="primary"
                onPress={() => void start()}
                isDisabled={isStarting || (!isAdmin && !canAffordCoins)}
                className="glow-primary gap-2 rounded-full px-8 py-4 text-[12px] font-bold uppercase tracking-[0.1em]"
              >
                {isStarting ? <Spinner size="sm" tone="current" /> : null}
                İmtahana başla
                <ArrowRightIcon width={15} height={15} />
              </Button>
            </div>

            {/* Coin entry is a pure SINK — nothing is earned back on a pass,
                so only the current coin balance is shown next to the price.
                Admins sit it for free, so their row reads "Pulsuz" instead of
                a price and shows no balance or afford link. */}
            <p className="mt-4 flex flex-wrap items-center gap-1.5 text-[13px] text-on-surface-variant">
              {isAdmin ? (
                <span className="font-semibold text-primary">Pulsuz</span>
              ) : (
                <>
                  <CoinIcon width={14} height={14} className="text-caution-orange" />
                  {coinPrice} coin ·{' '}
                  <span className="tabular-nums">{coins} qalıb</span>
                  {!canAffordCoins && (
                    <>
                      ·{' '}
                      <Link href="/coin-qazan" className="font-semibold text-primary hover:underline">
                        Coin qazan
                      </Link>
                    </>
                  )}
                </>
              )}
            </p>
          </div>

          <div className="lg:col-span-5">
            <div className="relative mx-auto flex aspect-square w-full max-w-[340px] items-center justify-center rounded-full bg-sage/25">
              {/* Dotted field from the export — decorative, static. */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full opacity-[0.14]"
                style={{
                  backgroundImage: 'radial-gradient(circle, var(--accent) 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                }}
              />
              <div className="relative z-10 text-center">
                {lastPct != null ? (
                  <>
                    <div className="editorial-display text-[64px] font-bold leading-none text-primary">
                      {lastPct}%
                    </div>
                    <div className="mt-2 text-[11px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">
                      Son nəticə
                    </div>
                    <div className="mt-4 inline-block rounded-full bg-primary px-4 py-1 text-[13px] font-bold tabular-nums text-on-primary">
                      {history.lastScore} / {history.lastTotal}
                    </div>
                  </>
                ) : (
                  <>
                    <TrophyIcon width={44} height={44} className="mx-auto text-primary" />
                    <div className="mt-3 text-[15px] font-semibold text-navy">
                      Hələ imtahan verməmisən
                    </div>
                    <div className="mt-1 text-[12px] text-on-surface-variant">
                      İlk nəticən burada görünəcək
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Bento: the active mode, the two planned ones, and the user's real
            attempt history. The export puts a per-subject competency chart in
            this slot; nothing records which category an answered exam question
            belonged to, so that is deliberately not shown — see the note in
            lib/exam/examHistory.ts. */}
        <section className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-4 lg:grid-cols-6">
          <div className="editorial-shadow relative overflow-hidden rounded-[2rem] border border-primary/25 bg-primary/[0.06] p-7 md:col-span-2">
            <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-primary text-on-primary">
              <ClockIcon width={22} height={22} />
            </div>
            <h3 className="text-[20px] font-semibold text-navy">Standart İmtahan</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-on-surface-variant">
              15 dəqiqə · {QUESTION_COUNT} sual · keçid həddi {passThreshold}. Real imtahan formatı.
            </p>
            <span className="mt-6 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-primary">
              Aktiv rejim
              <CheckIcon width={14} height={14} />
            </span>
          </div>

          {LOCKED_MODES.map((mode) => {
            const Icon = mode.icon;
            return (
              <div
                key={mode.title}
                aria-disabled="true"
                className={`relative overflow-hidden rounded-[2rem] p-7 opacity-70 md:col-span-2 ${mode.tone}`}
              >
                <div className="mb-6 flex size-12 items-center justify-center rounded-full bg-surface text-on-surface-variant">
                  <Icon width={22} height={22} />
                </div>
                <h3 className="text-[20px] font-semibold text-navy">{mode.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-navy/70">{mode.desc}</p>
                <span className="mt-6 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-navy/60">
                  <LockIcon width={13} height={13} />
                  Tezliklə
                </span>
              </div>
            );
          })}

          {/* Per-subject competency — the export's chart, on real data.
              Computed from stored per-question answers joined to each
              question's category (see lib/exam/examHistory.ts). Categories with
              fewer than 3 answers are omitted rather than shown as 0%/100%. */}
          {history.competency.length > 0 && (
            <div className="editorial-shadow rounded-[2rem] border border-border/40 bg-surface p-7 md:col-span-4 lg:col-span-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">
                Mövzu üzrə güc
              </h3>
              <ul className="mt-6 space-y-5">
                {history.competency.map((row) => (
                  <li key={row.category}>
                    <div className="mb-2 flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[13px] font-bold text-on-surface">
                        {row.category}
                      </span>
                      <span
                        className={`shrink-0 text-[13px] font-bold tabular-nums ${
                          row.percent >= 80
                            ? 'text-go-green'
                            : row.percent >= 50
                              ? 'text-primary'
                              : 'text-caution-orange'
                        }`}
                      >
                        {row.percent}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
                      <div
                        className={`h-full rounded-full ${
                          row.percent >= 80
                            ? 'bg-go-green'
                            : row.percent >= 50
                              ? 'bg-primary'
                              : 'bg-caution-orange'
                        }`}
                        style={{ width: `${row.percent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-on-surface-variant tabular-nums">
                      {row.correct}/{row.answered} düzgün
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Real attempt history in the export's analytics slot. */}
          <div
            className={`editorial-shadow rounded-[2rem] border border-border/40 bg-surface p-7 md:col-span-4 ${
              history.competency.length > 0 ? 'lg:col-span-3' : 'lg:col-span-6'
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border/40 pb-4">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-on-surface-variant">
                Nəticələrin
              </h3>
              {history.attempts > 0 && (
                <span className="text-[13px] text-on-surface-variant">
                  {history.attempts} cəhd · ən yaxşı{' '}
                  <span className="font-bold tabular-nums text-primary">
                    {history.bestScore}/{history.lastTotal ?? QUESTION_COUNT}
                  </span>
                </span>
              )}
            </div>

            {history.recent.length === 0 ? (
              <p className="pt-5 text-[14px] text-on-surface-variant">
                İlk imtahanını verəndən sonra nəticələrin burada toplanacaq.
              </p>
            ) : (
              <ul className="mt-5 space-y-4">
                {history.recent.map((attempt, i) => {
                  const pct = Math.round((attempt.score / attempt.total) * 100);
                  const passedAttempt = attempt.score >= passThreshold;
                  return (
                    <li key={i}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-[13px] font-semibold text-on-surface">
                          {new Date(attempt.at).toLocaleDateString('az-AZ', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                        <span
                          className={`text-[13px] font-bold tabular-nums ${
                            passedAttempt ? 'text-go-green' : 'text-on-surface-variant'
                          }`}
                        >
                          {attempt.score}/{attempt.total} · {pct}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
                        <div
                          className={`h-full rounded-full ${passedAttempt ? 'bg-go-green' : 'bg-primary'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <div className="mt-16">
        <Footer />
      </div>
    </div>
  );
}
