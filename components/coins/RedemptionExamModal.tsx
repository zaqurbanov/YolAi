'use client';

import { useCallback, useState } from 'react';
import { Button, Chip, Modal, useOverlayState } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { FineIcon } from '@/components/icons';
import {
  startRedemptionExamAction,
  submitRedemptionExamAction,
} from '@/app/coin-qazan/actions';
import type { RedemptionQuestion } from '@/lib/garage/fines';

const UNANSWERED = -1;

interface RedemptionExamModalProps {
  onCleared: () => void;
}

type Phase = 'idle' | 'loading' | 'playing' | 'submitting' | 'result';

// Draw → answer 3 → submit → show result. No coin/energy cost or reward
// anywhere in this flow (Mərhələ 4 is a pure status symbol) — never wire
// coin-balance-update here. The 15-minute token TTL is generous enough that
// no countdown/expiry UI is needed; an expired submit just surfaces
// expired_token's message and drops back to idle for a fresh draw.
export default function RedemptionExamModal({ onCleared }: RedemptionExamModalProps) {
  const overlay = useOverlayState();
  const [phase, setPhase] = useState<Phase>('idle');
  const [token, setToken] = useState<string | null>(null);
  const [questions, setQuestions] = useState<RedemptionQuestion[]>([]);
  const [answers, setAnswers] = useState<number[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [result, setResult] = useState<{ score: number; total: number; cleared: boolean } | null>(null);

  const currentIndex = answers.findIndex((a) => a === UNANSWERED);

  const resetToIdle = useCallback(() => {
    setPhase('idle');
    setToken(null);
    setQuestions([]);
    setAnswers([]);
    setNote(null);
    setResult(null);
  }, []);

  const submit = useCallback(
    async (finalAnswers: number[], drawnToken: string, drawnQuestions: RedemptionQuestion[]) => {
      setPhase('submitting');
      const res = await submitRedemptionExamAction({
        token: drawnToken,
        answers: drawnQuestions.map((q, i) => ({ questionId: q.id, selectedIndex: finalAnswers[i] })),
      });

      if (res.status === 'success') {
        setResult({ score: res.score ?? 0, total: res.total ?? 3, cleared: Boolean(res.cleared) });
        setPhase('result');
        if (res.cleared) onCleared();
        return;
      }

      // invalid_token / expired_token / invalid_answers / error — the draw
      // was never settled server-side, so just surface the message and let
      // the user re-draw.
      setNote(res.message);
      resetToIdle();
    },
    [onCleared, resetToIdle]
  );

  const start = useCallback(async () => {
    setPhase('loading');
    setNote(null);
    setResult(null);

    const res = await startRedemptionExamAction();
    if (res.status !== 'success' || !res.token || !res.questions) {
      setNote(res.message);
      setPhase('idle');
      return;
    }

    setToken(res.token);
    setQuestions(res.questions);
    setAnswers(Array(res.questions.length).fill(UNANSWERED));
    setPhase('playing');
  }, []);

  const selectOption = useCallback(
    (optionIndex: number) => {
      if (phase !== 'playing' || currentIndex < 0 || !token) return;
      const next = answers.slice();
      next[currentIndex] = optionIndex;
      setAnswers(next);
      if (!next.includes(UNANSWERED)) void submit(next, token, questions);
    },
    [phase, currentIndex, answers, token, questions, submit]
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onPress={() => {
          resetToIdle();
          overlay.open();
        }}
        className="gap-1.5 border-danger/40 text-danger hover:bg-danger/10"
      >
        <FineIcon width={14} height={14} />
        Bərpa İmtahanı
      </Button>
      <Modal.Backdrop
        isOpen={overlay.isOpen}
        onOpenChange={(open) => {
          overlay.setOpen(open);
          if (!open) resetToIdle();
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[420px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Icon className="bg-danger/15 text-danger">
                <FineIcon width={20} height={20} />
              </Modal.Icon>
              <Modal.Heading>Bərpa İmtahanı</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col items-center gap-4">
              {phase === 'idle' && (
                <>
                  <p className="text-body-md text-on-surface-variant text-center">
                    Səhv etdiyin mövzulardan 3 sual. Hamısına düzgün cavab versən, cərimə silinir.
                  </p>
                  {note && <p className="text-legal-citation text-danger text-center">{note}</p>}
                  <Button variant="primary" size="sm" onPress={() => void start()} className="glow-primary">
                    Başla
                  </Button>
                </>
              )}

              {phase === 'loading' && (
                <div className="flex items-center gap-2 py-6 text-on-surface-variant">
                  <Spinner size="sm" tone="current" />
                  <span className="text-body-md">Suallar hazırlanır...</span>
                </div>
              )}

              {(phase === 'playing' || phase === 'submitting') && questions.length > 0 && currentIndex >= 0 && (
                <div className="flex w-full flex-col items-center gap-4">
                  <p className="w-full text-label-sm text-on-surface-variant">
                    Sual {currentIndex + 1}/{questions.length}
                  </p>
                  <p className="text-body-md font-medium text-on-surface">
                    {questions[currentIndex].question}
                  </p>
                  <div className="grid w-full grid-cols-1 gap-2">
                    {questions[currentIndex].options.map((option, i) => (
                      <button
                        key={i}
                        type="button"
                        disabled={phase === 'submitting'}
                        onClick={() => selectOption(i)}
                        className="rounded-xl border border-outline-variant/40 bg-surface-tertiary/40 px-4 py-2.5 text-left text-body-md transition hover:border-primary/50 hover:bg-primary/5 disabled:opacity-60"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {phase === 'submitting' && currentIndex < 0 && (
                <div className="flex items-center gap-2 py-6 text-on-surface-variant">
                  <Spinner size="sm" tone="current" />
                  <span className="text-body-md">Yoxlanılır...</span>
                </div>
              )}

              {phase === 'result' && result && (
                <div className="flex flex-col items-center gap-3">
                  <p className="text-body-md font-semibold text-on-surface" aria-live="polite">
                    {result.score}/{result.total} doğru
                  </p>
                  <Chip color={result.cleared ? 'success' : 'danger'} variant="soft">
                    {result.cleared ? 'Cərimə silindi!' : 'Bu dəfə alınmadı'}
                  </Chip>
                  {!result.cleared && (
                    <p className="text-legal-citation text-on-surface-variant text-center">
                      Sabah yenidən cəhd edə bilərsən
                    </p>
                  )}
                </div>
              )}
            </Modal.Body>

            <Modal.Footer>
              <Button className="w-full" slot="close" variant="secondary" onPress={resetToIdle}>
                {phase === 'result' ? 'Bağla' : 'İmtina'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
