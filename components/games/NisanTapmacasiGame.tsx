'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { CheckIcon, CloseIcon, EnergyIcon } from '@/components/icons';
import AnimatedNumber from '@/components/AnimatedNumber';
import { useResetCountdown } from '@/components/useResetCountdown';
import { startNisanTapmacasiRoundAction, submitNisanTapmacasiRoundAction } from '@/app/coin-qazan/actions';
import type { NisanTapmacasiQuestion } from '@/lib/coins/nisanTapmacasi';

// "Nişan Tapmacası" — road sign riddle, the 4th games-section game, an exact
// frontend mirror of SignSpeedGame (same phase machine, same double-submit
// guard, same generic retry-friendly failure path, same ENERGY reward chip).
//
// CRITICAL DESIGN DECISION: the Stitch mockup draws a mini sign graphic inside
// each option. That CANNOT ship literally — showing unblurred sign artwork as
// the options would turn the game into trivial visual shape-matching, make the
// hint pointless, and give away the answer in the very picture meant to be the
// question. Options are TEXT LABELS only (the short official sign name), each
// on a friendly rounded card carrying a GENERIC road-sign glyph (rounded
// square + triangle/dot) that is byte-for-byte IDENTICAL across all four
// options and conveys no sign-specific information. The blurred photo in the
// header is the only real sign imagery in play.
//
// Deliberately UNTIMED (the design shows no timer): relaxed riddle, auto-
// advance on answer, submit fires the moment the 10th is answered. No
// cosmetic countdown, no expiry auto-submit.
//
// BLUR HINT: the header photo renders at blur(8px); hover (mouse pointer) or
// tap (touch) drops it to blur(4px) — a "small hint", never fully clear. The
// blur resets to 8px whenever the question advances, so a hint used for one
// question never leaks onto the next.
const UNANSWERED = -1;

interface NisanTapmacasiGameProps {
  energy: number;
  onSettled: (balance: number, energy: number) => void;
}

/**
 * Neutral road-sign glyph, IDENTICAL for every option — deliberately not the
 * actual sign artwork (see the design-decision comment at the top of the file).
 */
function SignGlyph() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M12 7.5 16 15H8l4-7.5Z" />
      <circle cx="12" cy="17" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Post-round review of one question. Only rendered in the 'result' phase, and
 * only from data the server hands back AFTER settling — the answer key is not
 * present client-side at any point during play (see lib/coins/nisanTapmacasi.ts).
 * The photo stays blurred (review is about the hint + labels, not the artwork),
 * and the correct option is revealed via result.correctIndices.
 */
function ReviewCard({
  question,
  picked,
  correctIndex,
  isCorrect,
  index,
}: {
  question: NisanTapmacasiQuestion;
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
        <span className="text-legal-citation text-on-surface-variant">Sual {index + 1}</span>
        <span
          className={`flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide ${
            isCorrect ? 'text-go-green' : 'text-error'
          }`}
        >
          {isCorrect ? <CheckIcon width={12} height={12} /> : <CloseIcon width={12} height={12} />}
          {isCorrect ? 'Düzgün' : 'Səhv'}
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-tertiary/40">
        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic Supabase Storage URL, kept blurred */}
        <img
          src={question.imageUrl}
          alt=""
          style={{ filter: 'blur(8px)' }}
          className="h-32 w-full object-contain"
        />
      </div>
      <p className="mt-2 text-body-md text-on-surface">{question.hint}</p>

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

export default function NisanTapmacasiGame({ energy, onSettled }: NisanTapmacasiGameProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<NisanTapmacasiQuestion[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  // Which question the result screen is showing, or null. Result phase only.
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [blur, setBlur] = useState(8);
  const [note, setNote] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [result, setResult] = useState<{
    correctCount: number;
    reward: number;
    correctFlags: boolean[];
    correctIndices: number[];
  } | null>(null);

  const submittedRef = useRef(false);

  const noEnergy = energy < 1;
  const countdown = useResetCountdown(noEnergy && phase !== 'playing' && phase !== 'submitting');
  const currentIndex = answers.findIndex((a) => a === UNANSWERED);

  const submit = useCallback(
    async (finalAnswers: number[]) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setPhase('submitting');

      const res = await submitNisanTapmacasiRoundAction(sessionId ?? '', finalAnswers);

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

  const start = useCallback(async () => {
    setPhase('starting');
    setNote(null);
    setResult(null);
    setReviewIndex(null);
    submittedRef.current = false;

    const res = await startNisanTapmacasiRoundAction();

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

  // A hint used for one question must never leak onto the next — reset to the
  // full 8px blur whenever the current question advances.
  useEffect(() => {
    setBlur(8);
  }, [currentIndex]);

  if (unavailable) {
    return <p className="text-body-md text-on-surface-variant">Oyun hazırda əlçatan deyil.</p>;
  }

  if (phase === 'playing' && questions.length > 0 && currentIndex >= 0) {
    const question = questions[currentIndex];
    const answeredCount = answers.filter((a) => a !== UNANSWERED).length;
    const progressPct = (answeredCount / questions.length) * 100;
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex w-full items-center justify-between text-label-sm text-on-surface-variant">
          <span>
            Sual {currentIndex + 1}/{questions.length}
          </span>
        </div>
        <QuestionBoxes count={questions.length} currentIndex={currentIndex} answers={answers} />
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary/40">
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${progressPct}%`, transition: 'width 300ms ease' }}
          />
        </div>

        <div className="w-full">
          {/* eslint-disable-next-line @next/next/no-img-element -- dynamic Supabase Storage URL, blurred by design, no next/image optimization needed */}
          <img
            src={question.imageUrl}
            alt=""
            style={{ filter: `blur(${blur}px)` }}
            onPointerEnter={(e) => {
              if (e.pointerType === 'mouse') setBlur(4);
            }}
            onPointerLeave={(e) => {
              if (e.pointerType === 'mouse') setBlur(8);
            }}
            onClick={() => setBlur((b) => (b === 8 ? 4 : 8))}
            className="h-44 w-full rounded-2xl border border-outline-variant/40 bg-surface-tertiary/40 object-contain transition"
          />
          <p className="mt-1.5 text-center text-legal-citation text-on-surface-variant">
            Toxun kiçik ipucu üçün
          </p>
        </div>

        <div className="w-full rounded-2xl border border-outline-variant/40 bg-surface-secondary/60 p-4">
          <div className="flex items-center gap-2 text-label-sm font-semibold text-on-surface-variant">
            <span aria-hidden>💡</span>
            <span>İpucu</span>
          </div>
          <p className="mt-2 text-body-md text-on-surface">{question.hint}</p>
        </div>

        <div className="grid w-full grid-cols-2 gap-3">
          {question.options.map((option, i) => (
            <button
              key={i}
              type="button"
              onClick={() => selectOption(i)}
              className="flex items-center gap-2.5 rounded-2xl border border-outline-variant/40 bg-surface-tertiary/40 p-3 text-left transition hover:border-primary/60 hover:bg-primary/5 active:border-primary active:bg-primary/10"
            >
              <span className="shrink-0 text-on-surface-variant">
                <SignGlyph />
              </span>
              <span className="min-w-0 text-body-md text-on-surface">{option}</span>
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
        Bulanıq nişanı ipucu ilə tanı · 10 sual, 1 tur · hər düzgün cavab enerji gətirir
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
