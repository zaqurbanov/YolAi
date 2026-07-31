'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { CheckIcon, CloseIcon, EnergyIcon } from '@/components/icons';
import AnimatedNumber from '@/components/AnimatedNumber';
import { useResetCountdown } from '@/components/useResetCountdown';
import { startSignSpeedRoundAction, submitSignSpeedRoundAction } from '@/app/coin-qazan/actions';
import type { SignSpeedQuestion } from '@/lib/coins/signSpeed';

// ~60s COSMETIC countdown only — creates urgency ("sürət"), scoring never
// depends on it. The server's real staleness ceiling is
// sign_speed_session_ttl_seconds (default 180s), checked at submit time; this
// bar expiring just triggers an early auto-submit of whatever's answered so
// far. Unanswered questions default to option 0 (never -1/out-of-range —
// submitSignSpeedRoundAction validates every answer is 0-3 and would reject
// an invalid placeholder as invalid_answers, which is the wrong error for
// "the user simply ran out of time").
const ROUND_DURATION_MS = 60_000;
const UNANSWERED = -1;

interface SignSpeedGameProps {
  /** Shared with XO — same energy pool, same number, never a second meter. */
  energy: number;
  onSettled: (balance: number, energy: number) => void;
}

/**
 * Post-round review of one question. Only rendered in the 'result' phase, and
 * only from data the server hands back AFTER settling — the answer key is not
 * present client-side at any point during play (see lib/coins/signSpeed.ts).
 */
function ReviewCard({
  question,
  picked,
  correctIndex,
  isCorrect,
  index,
}: {
  question: SignSpeedQuestion;
  picked: number;
  correctIndex: number | undefined;
  isCorrect: boolean;
  index: number;
}) {
  return (
    <div
      className={`w-full rounded-2xl border p-4 text-left ${
        isCorrect ? 'border-go-green/40 bg-go-green/5' : 'border-error/40 bg-error/5'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-legal-citation text-on-surface-variant">
          Sual {index + 1} · {question.code}
        </span>
        <span
          className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide ${
            isCorrect ? 'text-go-green' : 'text-error'
          }`}
        >
          {isCorrect ? <CheckIcon width={12} height={12} /> : <CloseIcon width={12} height={12} />}
          {isCorrect ? 'Düzgün' : 'Səhv'}
        </span>
      </div>

      {question.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- Supabase public storage URL.
        <img
          src={question.imageUrl}
          alt=""
          className="mx-auto mt-3 size-20 rounded-xl border border-outline-variant/40 bg-surface object-contain"
        />
      )}

      <ul className="mt-3 space-y-1.5">
        {question.options.map((option, i) => {
          const isPicked = i === picked;
          const isAnswer = i === correctIndex;
          return (
            <li
              key={i}
              className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-[13px] ${
                isAnswer
                  ? 'bg-go-green/12 font-semibold text-go-green'
                  : isPicked
                    ? 'bg-error/12 text-error line-through'
                    : 'text-on-surface-variant'
              }`}
            >
              <span className="mt-0.5 shrink-0">
                {isAnswer ? (
                  <CheckIcon width={12} height={12} />
                ) : isPicked ? (
                  <CloseIcon width={12} height={12} />
                ) : (
                  <span className="inline-block size-3" />
                )}
              </span>
              <span>{option}</span>
            </li>
          );
        })}
      </ul>

      {!isCorrect && picked === UNANSWERED && (
        <p className="mt-2 text-legal-citation text-on-surface-variant">
          Bu suala cavab verilmədi — vaxt bitdi.
        </p>
      )}
    </div>
  );
}

type Phase = 'idle' | 'starting' | 'playing' | 'submitting' | 'result';

/**
 * 10-box progress strip, shared shape between 'playing' (progress only, no
 * grading available yet) and 'result' (revealed ✓/✗ from the server's
 * per-question grading). Never infer correctness during 'playing' — the
 * server withholds it until the round is submitted and graded as a whole.
 */
function QuestionBoxes({
  count,
  currentIndex,
  answers,
  correctFlags,
  onReview,
  reviewIndex,
}: {
  count: number;
  currentIndex?: number;
  answers?: number[];
  correctFlags?: boolean[];
  /** Only passed in the result phase — makes each box open that question. */
  onReview?: (index: number) => void;
  reviewIndex?: number | null;
}) {
  return (
    <div className="grid w-full grid-cols-10 gap-1">
      {Array.from({ length: count }, (_, i) => {
        if (correctFlags) {
          const isCorrect = correctFlags[i];
          const isOpen = reviewIndex === i;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onReview?.(i)}
              aria-label={`Sual ${i + 1} — ${isCorrect ? 'düzgün' : 'səhv'}, baxmaq üçün toxun`}
              aria-pressed={isOpen}
              className={`flex size-6 items-center justify-center rounded-md text-[10px] transition ${
                isCorrect ? 'bg-go-green/15 text-go-green' : 'bg-error/15 text-error'
              } ${isOpen ? 'ring-2 ring-primary ring-offset-1 ring-offset-surface' : 'hover:opacity-75'}`}
            >
              {isCorrect ? <CheckIcon width={10} height={10} /> : <CloseIcon width={10} height={10} />}
            </button>
          );
        }

        const isCurrent = i === currentIndex;
        const isAnswered = answers ? answers[i] !== UNANSWERED : false;
        return (
          <span
            key={i}
            className={`size-6 rounded-md border ${
              isCurrent
                ? 'border-primary ring-2 ring-primary'
                : isAnswered
                  ? 'border-primary/40 bg-primary/40'
                  : 'border-outline-variant/40 bg-surface-tertiary/40'
            }`}
          />
        );
      })}
    </div>
  );
}

export default function SignSpeedGame({ energy, onSettled }: SignSpeedGameProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<SignSpeedQuestion[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  // Which question the result screen is showing, or null. Result phase only.
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(ROUND_DURATION_MS);
  const [note, setNote] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [result, setResult] = useState<{
    correctCount: number;
    reward: number;
    correctFlags: boolean[];
    correctIndices: number[];
  } | null>(null);

  const deadlineRef = useRef(0);
  const submittedRef = useRef(false);

  const noEnergy = energy < 1;
  const countdown = useResetCountdown(noEnergy && phase !== 'playing' && phase !== 'submitting');
  const currentIndex = answers.findIndex((a) => a === UNANSWERED);

  const submit = useCallback(
    async (finalAnswers: number[]) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setPhase('submitting');

      const res = await submitSignSpeedRoundAction(sessionId ?? '', finalAnswers);

      if (res.status === 'success') {
        setResult({
          correctCount: res.correctCount ?? 0,
          reward: res.reward ?? 0,
          correctFlags: res.correctFlags ?? Array(10).fill(false),
          correctIndices: res.correctIndices ?? [],
        });
        setPhase('result');
        if (typeof res.balance === 'number' && typeof res.energy === 'number') {
          onSettled(res.balance, res.energy);
        }
        return;
      }

      if (res.status === 'unavailable') {
        setUnavailable(true);
        setPhase('idle');
        return;
      }

      // session_not_found / already_used / session_expired / invalid_answers /
      // error — all generic + retry-friendly: surface the message, drop back
      // to the start screen (the session was never settled, so no coins/energy
      // to reconcile beyond what start already spent).
      setNote(res.message);
      setPhase('idle');
      setSessionId(null);
      setQuestions([]);
      setAnswers([]);
    },
    [sessionId, onSettled]
  );

  // Round countdown ticking + expiry auto-submit.
  useEffect(() => {
    if (phase !== 'playing') return;
    const tick = () => {
      const left = Math.max(0, deadlineRef.current - Date.now());
      setRemainingMs(left);
      if (left <= 0) {
        void submit(answers.map((a) => (a === UNANSWERED ? 0 : a)));
      }
    };
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [phase, answers, submit]);

  const start = useCallback(async () => {
    setPhase('starting');
    setNote(null);
    setResult(null);
    submittedRef.current = false;

    const res = await startSignSpeedRoundAction();

    if (res.status !== 'success' || !res.sessionId || !res.questions) {
      if (res.status === 'pool_too_small' || res.status === 'unavailable') {
        setUnavailable(true);
      } else {
        // no_energy / error
        setNote(res.message);
      }
      setPhase('idle');
      return;
    }

    setSessionId(res.sessionId);
    setQuestions(res.questions);
    setAnswers(Array(res.questions.length).fill(UNANSWERED));
    deadlineRef.current = Date.now() + ROUND_DURATION_MS;
    setRemainingMs(ROUND_DURATION_MS);
    setPhase('playing');
  }, []);

  const selectOption = useCallback(
    (optionIndex: number) => {
      if (phase !== 'playing' || currentIndex < 0) return;
      const next = answers.slice();
      next[currentIndex] = optionIndex;
      setAnswers(next);
      if (!next.includes(UNANSWERED)) void submit(next);
    },
    [phase, currentIndex, answers, submit]
  );

  if (unavailable) {
    return <p className="text-body-md text-on-surface-variant">Oyun hazırda əlçatan deyil.</p>;
  }

  if (phase === 'playing' && questions.length > 0 && currentIndex >= 0) {
    const question = questions[currentIndex];
    const progressPct = Math.max(0, Math.min(100, (remainingMs / ROUND_DURATION_MS) * 100));
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex w-full items-center justify-between text-label-sm text-on-surface-variant">
          <span>
            Sual {currentIndex + 1}/{questions.length}
          </span>
          <span className="tabular-nums" aria-live="polite">
            {Math.ceil(remainingMs / 1000)}s
          </span>
        </div>
        <QuestionBoxes count={questions.length} currentIndex={currentIndex} answers={answers} />
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary/40">
          <div
            className={`h-full rounded-full ${progressPct <= 20 ? 'bg-error' : 'bg-primary'}`}
            style={{ width: `${progressPct}%`, transition: 'width 200ms linear' }}
          />
        </div>

        <p className="text-legal-citation uppercase text-on-surface-variant">Nişan</p>
        {question.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- dynamic Supabase Storage URL, small size, no next/image optimization needed
          <img
            src={question.imageUrl}
            alt={`Nişan ${question.code}`}
            className="size-24 rounded-xl border border-outline-variant/40 bg-surface-tertiary/40 object-contain"
          />
        )}
        <p className="text-headline-md text-[22px] text-primary">{question.code}</p>

        <div className="grid w-full grid-cols-1 gap-2">
          {question.options.map((option, i) => (
            <button
              key={i}
              type="button"
              onClick={() => selectOption(i)}
              className="rounded-xl border border-outline-variant/40 bg-surface-tertiary/40 px-4 py-2.5 text-left text-body-md transition hover:border-primary/50 hover:bg-primary/5"
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (phase === 'result' && result) {
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="text-body-md font-semibold text-go-green" aria-live="polite">
          {result.correctCount}/10 doğru!
        </p>
        {/* Tapping a box opens that question below. Reviewing what you got
            wrong is the only way this game teaches anything — before, the row
            told you the score and nothing else. */}
        <QuestionBoxes
          count={result.correctFlags.length}
          correctFlags={result.correctFlags}
          onReview={(i) => setReviewIndex((prev) => (prev === i ? null : i))}
          reviewIndex={reviewIndex}
        />
        <p className="text-legal-citation text-on-surface-variant">
          Cavaba baxmaq üçün qutuya toxun
        </p>

        {reviewIndex !== null && questions[reviewIndex] && (
          <ReviewCard
            question={questions[reviewIndex]}
            picked={answers[reviewIndex]}
            correctIndex={result.correctIndices[reviewIndex]}
            isCorrect={result.correctFlags[reviewIndex]}
            index={reviewIndex}
          />
        )}
        {/* result.reward is ENERGY since 0094 — same field, different currency. */}
        <span className="flex items-center gap-1.5 rounded-full bg-caution-orange/15 px-3 py-1 text-caution-orange">
          <EnergyIcon width={16} height={16} />
          <AnimatedNumber
            value={result.reward}
            format={(n) => `+${Math.round(n)}`}
            className="text-body-md font-semibold tabular-nums"
          />
          <span className="text-legal-citation">enerji</span>
        </span>
        {noEnergy ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-label-sm text-on-surface-variant">Enerji yenilənməsinə qalıb:</p>
            <p className="text-body-md font-semibold tabular-nums text-caution-orange">
              {countdown ?? '—'}
            </p>
          </div>
        ) : (
          <Button variant="primary" size="sm" onPress={() => void start()} className="glow-primary">
            Yenidən oyna (1 ⚡)
          </Button>
        )}
      </div>
    );
  }

  // idle / starting / submitting
  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-body-md font-medium text-on-surface-variant">
        Nişanın kodunu gör, düzgün izahını seç · 10 sual, 1 tur · hər düzgün cavab enerji gətirir
      </p>

      {note && <p className="text-label-sm text-caution-orange">{note}</p>}

      {noEnergy ? (
        <div className="flex flex-col items-center gap-1">
          <p className="text-label-sm text-on-surface-variant">Enerji yenilənməsinə qalıb:</p>
          <p className="text-body-md font-semibold tabular-nums text-caution-orange">
            {countdown ?? '—'}
          </p>
        </div>
      ) : (
        <Button
          variant="primary"
          size="sm"
          isPending={phase === 'starting' || phase === 'submitting'}
          isDisabled={phase === 'starting' || phase === 'submitting'}
          onPress={() => void start()}
          className="glow-primary"
        >
          Başla (1 ⚡)
        </Button>
      )}
    </div>
  );
}
