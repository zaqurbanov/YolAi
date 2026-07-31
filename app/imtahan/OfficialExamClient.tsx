'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, toast } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import MobileBottomTabBar from '@/components/home/MobileBottomTabBar';
import { Spinner } from '@/components/Spinner';
import {
  startExamSessionAction,
  submitExamSessionAction,
  type StartExamState,
} from '@/app/coin-qazan/actions';
import type { ExamQuestion } from '@/lib/exam/examPool';
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

interface OfficialExamClientProps {
  initialBalance: number;
  initialEnergy: number;
  maxEnergy: number;
  coinPrice: number;
  energyCost: number;
  passThreshold: number;
}

type Phase = 'idle' | 'running' | 'finished';

function formatTime(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function OfficialExamClient({
  initialBalance,
  initialEnergy,
  maxEnergy,
  coinPrice,
  energyCost,
  passThreshold,
}: OfficialExamClientProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [balance, setBalance] = useState(initialBalance);
  const [energy, setEnergy] = useState(initialEnergy);
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

  async function start(paymentMethod: 'coin' | 'energy') {
    setIsStarting(true);
    try {
      const res: StartExamState = await startExamSessionAction(paymentMethod);
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
      if (typeof res.balance === 'number') setBalance(res.balance);
      if (typeof res.energy === 'number') setEnergy(res.energy);
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
      <div className="flex min-h-full flex-col bg-background">
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
                isLow ? 'bg-danger' : 'ethereal-gradient'
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
                          ? 'ethereal-gradient text-white'
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
                className="ethereal-gradient glow-primary flex-1 gap-2 rounded-full border-0 text-white disabled:opacity-45"
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
                className="ethereal-gradient glow-primary flex-1 gap-2 rounded-full border-0 text-white disabled:opacity-45"
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
      <div className="flex flex-col pb-24">
        <div className="mx-auto w-full max-w-2xl px-5 py-10">
          <div
            className={`glass-card relative overflow-hidden rounded-[2rem] p-8 text-center ${
              passed ? 'luminous-shadow-teal' : 'luminous-shadow-violet'
            }`}
          >
            <div
              className={`ethereal-orb -right-16 -top-16 size-56 ${passed ? 'bg-secondary/25' : 'bg-danger/15'}`}
              aria-hidden
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
              <p className="ethereal-gradient-text mt-1 text-6xl font-extrabold tabular-nums">
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
                  className="ethereal-gradient glow-primary gap-2 rounded-full border-0 text-white"
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
        <MobileBottomTabBar />
      </div>
    );
  }

  // ------------------------------------------------------------------ landing
  const canAffordCoins = balance >= coinPrice;
  const canAffordEnergy = energy >= energyCost;

  return (
    <div className="relative flex flex-col overflow-hidden pb-24">
      {/* Ambient orbs from the Stitch "İmtahan (Ethereal)" screen. */}
      <div className="ethereal-orb -right-24 -top-24 size-96 bg-primary/10" aria-hidden />
      <div className="ethereal-orb -left-24 top-1/2 size-80 bg-secondary/10" aria-hidden />

      <div className="relative z-10 mx-auto w-full max-w-[1280px] px-5 pt-10 md:px-12">
        <section className="text-center">
          <span className="text-legal-citation inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-primary">
            <TrophyIcon width={14} height={14} />
            PREMİUM SİMULYASİYA
          </span>
          <h1 className="mx-auto mt-6 max-w-2xl text-[28px] font-extrabold leading-tight tracking-tight text-on-surface md:text-[40px]">
            Yol Hərəkəti Qaydaları
            <br />
            <span className="ethereal-gradient-text">İmtahan Simulyasiyası</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-body-md text-on-surface-variant">
            Real imtahan mühitində özünüzü sınayın — {QUESTION_COUNT} sual, 15 dəqiqə, geri sayım.
            Suallar dərc edilmiş bazadan hər dəfə yenidən seçilir.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3">
            <Button
              variant="primary"
              onPress={() => void start('energy')}
              isDisabled={isStarting || !canAffordEnergy}
              className="ethereal-gradient glow-primary gap-3 rounded-full border-0 px-10 py-6 text-[16px] font-bold text-white"
            >
              {isStarting ? <Spinner size="sm" tone="current" /> : null}
              Sınaq İmtahanına Başla
              <ArrowRightIcon width={18} height={18} />
            </Button>
            <p className="text-label-sm text-on-surface-variant">
              {energyCost} enerji ({energy}/{maxEnergy} qalıb)
            </p>

            <button
              type="button"
              onClick={() => void start('coin')}
              disabled={isStarting || !canAffordCoins}
              className="mt-1 inline-flex items-center gap-1.5 text-label-sm font-semibold text-primary transition hover:gap-2.5 disabled:opacity-45"
            >
              <CoinIcon width={14} height={14} />
              və ya {coinPrice} coin ilə başla ({balance} coin)
            </button>

            {!canAffordEnergy && !canAffordCoins && (
              <Link
                href="/coin-qazan"
                className="text-label-sm font-semibold text-secondary hover:underline"
              >
                Coin qazan →
              </Link>
            )}
          </div>
        </section>

        <section className="mt-16">
          <div className="mb-6 flex items-center gap-6">
            <h2 className="text-headline-md text-on-surface">Rejim Seçimi</h2>
            <div className="holographic-divider flex-1" />
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <div className="glass-card luminous-shadow-violet group relative flex flex-col justify-between overflow-hidden rounded-[2rem] p-7">
              <div className="ethereal-orb -right-8 -top-8 size-32 bg-primary/15" aria-hidden />
              <div className="relative z-10">
                <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                  <ClockIcon width={26} height={26} />
                </div>
                <h3 className="text-[20px] font-semibold text-on-surface">Standart İmtahan</h3>
                <p className="mt-2 text-label-sm leading-relaxed text-on-surface-variant">
                  15 dəqiqə • {QUESTION_COUNT} sual • keçid həddi {passThreshold}. Real imtahan
                  formatı.
                </p>
              </div>
              <span className="relative z-10 mt-6 inline-flex items-center gap-1.5 text-label-sm font-semibold text-primary">
                AKTİV REJİM
                <CheckIcon width={14} height={14} />
              </span>
            </div>

            {[
              {
                title: 'Öyrənmə Rejimi',
                desc: 'Vaxt məhdudiyyəti yoxdur. Hər sualdan sonra izahlı cavablar.',
                icon: RulesIcon,
              },
              {
                title: 'Zəif Nöqtələr',
                desc: 'Ən çox səhv etdiyin suallar üzərində fokuslanma.',
                icon: TrophyIcon,
              },
            ].map((mode) => {
              const Icon = mode.icon;
              return (
                <div
                  key={mode.title}
                  aria-disabled="true"
                  className="glass-card relative flex flex-col justify-between overflow-hidden rounded-[2rem] p-7 opacity-60"
                >
                  <div>
                    <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-surface-secondary text-on-surface-variant">
                      <Icon width={26} height={26} />
                    </div>
                    <h3 className="text-[20px] font-semibold text-on-surface">{mode.title}</h3>
                    <p className="mt-2 text-label-sm leading-relaxed text-on-surface-variant">
                      {mode.desc}
                    </p>
                  </div>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-label-sm font-semibold text-on-surface-variant">
                    <LockIcon width={13} height={13} />
                    Tezliklə
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-16">
          <div className="glass-card luminous-shadow-teal relative overflow-hidden rounded-[2rem] p-7 md:p-10">
            <div className="ethereal-orb -bottom-16 -left-16 size-56 bg-secondary/20" aria-hidden />
            <div className="relative z-10 grid gap-8 md:grid-cols-2">
              <div>
                <h2 className="text-headline-md text-on-surface">İmtahan qaydaları</h2>
                <p className="mt-2 text-body-md text-on-surface-variant">
                  Başladıqdan sonra geri sayım dayanmır. Sualların arasında sərbəst hərəkət edə,
                  cavabını dəyişə bilərsən — nəticə yalnız sonda hesablanır.
                </p>
              </div>
              <ul className="space-y-4">
                {[
                  {
                    title: 'Server tərəfli qiymətləndirmə',
                    desc: 'Düzgün cavablar heç vaxt brauzerə göndərilmir — nəticə serverdə hesablanır.',
                  },
                  {
                    title: 'Hər dəfə yeni suallar',
                    desc: `Dərc edilmiş bütün sualların içindən təsadüfi ${QUESTION_COUNT} sual seçilir.`,
                  },
                ].map((item) => (
                  <li key={item.title} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary-container/60 text-on-secondary-container">
                      <CheckIcon width={13} height={13} />
                    </span>
                    <span>
                      <span className="block text-body-md font-semibold text-on-surface">
                        {item.title}
                      </span>
                      <span className="block text-label-sm text-on-surface-variant">{item.desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>

      <MobileBottomTabBar />
    </div>
  );
}
