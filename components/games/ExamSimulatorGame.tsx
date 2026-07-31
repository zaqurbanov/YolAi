'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Chip, toast } from '@heroui/react';
import { ShareIcon, CopyIcon, EnergyIcon } from '@/components/icons';
import {
  startExamSessionAction,
  submitExamSessionAction,
  generateExamShareLinkAction,
} from '@/app/coin-qazan/actions';
import type { ExamQuestion } from '@/lib/exam/examPool';

// 15-minute, 10-question, all-topics-mixed mock exam — pure ENERGY SINK, no
// reward on completion (unlike SignSpeedGame/TicTacToeGame). The coin entry
// path was removed in 0094_two_currency_economy.sql. Entry price (1 energy) is
// fixed by the backend contract (startExamSessionAction/lib/exam/
// examSession.ts's DEFAULT_EXAM_ENERGY_COST); this component never invents or
// overrides that number, it only mirrors it in the button label.
const EXAM_DURATION_MS = 15 * 60_000;
const UNANSWERED = -1;
const EXAM_ENERGY_COST = 1;

// Frontend-only pass/fail badge threshold — NOT enforced server-side. Per
// supabase/migrations/0082_exam_simulator.sql's exam_pass_threshold comment
// ("default 8 — frontend badge only, NOT enforced here"), no TS export
// exists for this; kept here as a plain constant. app/share/[token]/page.tsx
// duplicates the same literal for the shared-result badge — keep both in
// sync if this ever changes.
const PASS_THRESHOLD = 8;

function formatTime(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

interface ExamSimulatorGameProps {
  energy: number;
  /** Reports the server's post-start (coins, energy) back to the shared meters. */
  onSettled: (balance: number, energy: number) => void;
}

type Phase = 'idle' | 'starting' | 'playing' | 'submitting' | 'result';

export default function ExamSimulatorGame({ energy, onSettled }: ExamSimulatorGameProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ExamQuestion[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [remainingMs, setRemainingMs] = useState(EXAM_DURATION_MS);
  const [note, setNote] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);

  const deadlineRef = useRef(0);
  const submittedRef = useRef(false);

  const currentIndex = answers.findIndex((a) => a === UNANSWERED);
  const busy = phase === 'starting' || phase === 'submitting';

  const submit = useCallback(
    async (finalAnswers: number[]) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setPhase('submitting');

      const res = await submitExamSessionAction(sessionId ?? '', finalAnswers);

      if (res.status === 'success') {
        setResult({ score: res.score ?? 0, total: res.total ?? 10 });
        setPhase('result');
        return;
      }

      if (res.status === 'unavailable') {
        setUnavailable(true);
        setPhase('idle');
        return;
      }

      // session_not_found / already_used / session_expired / invalid_answers /
      // error — surface the message and drop back to the start screen. The
      // session was never settled, so there's nothing to reconcile beyond
      // what start already spent.
      setNote(res.message);
      setPhase('idle');
      setSessionId(null);
      setQuestions([]);
      setAnswers([]);
    },
    [sessionId]
  );

  // Exam countdown ticking + expiry auto-submit (unanswered questions default
  // to option 0 — never -1/out-of-range, since submitExamSessionAction
  // validates every answer is 0-3).
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

  const start = useCallback(
    async () => {
      setPhase('starting');
      setNote(null);
      setResult(null);
      setShareUrl(null);
      setCopied(false);
      submittedRef.current = false;

      const res = await startExamSessionAction();

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

      if (typeof res.balance === 'number' && typeof res.energy === 'number') {
        onSettled(res.balance, res.energy);
      }

      setSessionId(res.sessionId);
      setQuestions(res.questions);
      setAnswers(Array(res.questions.length).fill(UNANSWERED));
      deadlineRef.current = Date.now() + EXAM_DURATION_MS;
      setRemainingMs(EXAM_DURATION_MS);
      setPhase('playing');
    },
    [onSettled]
  );

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

  const handleShare = useCallback(async () => {
    if (!sessionId) return;
    setSharing(true);
    try {
      const res = await generateExamShareLinkAction(sessionId);
      if (res.status === 'success' && res.url) {
        setShareUrl(`${window.location.origin}${res.url}`);
      } else {
        toast.danger(res.message ?? 'Paylaşım linki yaradıla bilmədi');
      }
    } finally {
      setSharing(false);
    }
  }, [sessionId]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success('Link kopyalandı');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.danger('Linki kopyalamaq uğursuz oldu');
    }
  }, [shareUrl]);

  const resetToIdle = useCallback(() => {
    setPhase('idle');
    setSessionId(null);
    setQuestions([]);
    setAnswers([]);
    setResult(null);
    setShareUrl(null);
    setNote(null);
  }, []);

  if (unavailable) {
    return <p className="text-body-md text-on-surface-variant">İmtahan hazırda əlçatan deyil.</p>;
  }

  if (phase === 'playing' && questions.length > 0 && currentIndex >= 0) {
    const question = questions[currentIndex];
    const progressPct = Math.max(0, Math.min(100, (remainingMs / EXAM_DURATION_MS) * 100));
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="flex w-full items-center justify-between text-label-sm text-on-surface-variant">
          <span>
            Sual {currentIndex + 1}/{questions.length}
          </span>
          <span className="tabular-nums" aria-live="polite">
            {formatTime(remainingMs)}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary/40">
          <div
            className={`h-full rounded-full ${progressPct <= 20 ? 'bg-error' : 'bg-primary'}`}
            style={{ width: `${progressPct}%`, transition: 'width 200ms linear' }}
          />
        </div>

        <p className="text-body-md font-medium text-on-surface">{question.question}</p>

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
    const passed = result.score >= PASS_THRESHOLD;
    return (
      <div className="flex flex-col items-center gap-3">
        <p className="text-body-md font-semibold text-on-surface" aria-live="polite">
          {result.score}/{result.total} doğru
        </p>
        <Chip color={passed ? 'success' : 'danger'} variant="soft">
          {passed ? 'Keçdin!' : 'Keçmədin'}
        </Chip>

        {shareUrl ? (
          <div className="flex w-full flex-col items-center gap-2">
            <p className="w-full truncate rounded-xl border border-outline-variant/40 bg-surface-tertiary/40 px-3 py-2 text-center text-legal-citation text-on-surface-variant">
              {shareUrl}
            </p>
            <Button variant="secondary" size="sm" onPress={() => void handleCopy()} className="gap-1.5">
              <CopyIcon width={16} height={16} />
              {copied ? 'Kopyalandı' : 'Linki kopyala'}
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            isPending={sharing}
            isDisabled={sharing}
            onPress={() => void handleShare()}
            className="gap-1.5"
          >
            <ShareIcon width={16} height={16} />
            Nəticəni paylaş
          </Button>
        )}

        <Button variant="primary" size="sm" onPress={resetToIdle} className="glow-primary">
          Yeni imtahan
        </Button>
      </div>
    );
  }

  // idle / starting / submitting
  const noEnergy = energy < EXAM_ENERGY_COST;

  return (
    <div className="flex flex-col items-center gap-4">
      <p className="text-body-md font-medium text-on-surface-variant">
        15 dəqiqə · 10 sual · rəsmi format · mükafat yoxdur
      </p>

      {note && <p className="text-label-sm text-caution-orange">{note}</p>}

      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="primary"
          size="sm"
          isPending={phase === 'starting' || phase === 'submitting'}
          isDisabled={busy || noEnergy}
          onPress={() => void start()}
          className="glow-primary gap-1.5"
        >
          <EnergyIcon width={15} height={15} />
          {EXAM_ENERGY_COST} enerji ilə başla
        </Button>
      </div>
    </div>
  );
}
