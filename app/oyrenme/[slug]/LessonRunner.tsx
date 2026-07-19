'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { RadioGroup, Radio, Button, Alert, toast } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { Spinner } from '@/components/Spinner';
import { CoinIcon, CheckIcon } from '@/components/icons';
import { submitLessonAnswerAction, type LessonAnswerState } from '@/app/oyrenme/actions';
import type { LessonQuestion } from '@/lib/quiz/lessons';

interface LessonRunnerProps {
  category: string;
  questions: LessonQuestion[];
}

const STATUS_TO_ALERT: Record<LessonAnswerState['status'], 'success' | 'danger' | 'warning'> = {
  correct: 'success',
  incorrect: 'danger',
  already_answered: 'warning',
  error: 'danger',
};

// Resume behaviour: on load, skip past every question already answered
// correctly and start at the first unanswered one. Previously-answered
// questions aren't shown read-only in this pass — re-visiting a finished
// lesson just shows the completion summary immediately (see below).
function findStartIndex(questions: LessonQuestion[]): number {
  const idx = questions.findIndex((q) => !q.answeredCorrectly);
  return idx === -1 ? questions.length : idx;
}

export default function LessonRunner({ category, questions }: LessonRunnerProps) {
  const [index, setIndex] = useState(() => findStartIndex(questions));
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<LessonAnswerState | null>(null);
  const [sessionCoins, setSessionCoins] = useState(0);
  const [isPending, startTransition] = useTransition();

  const alreadyCompletedCount = useMemo(() => questions.filter((q) => q.answeredCorrectly).length, [questions]);

  const current = index < questions.length ? questions[index] : null;
  const isDone = index >= questions.length;

  function handleSubmit() {
    if (!current || selected == null) return;
    startTransition(async () => {
      const state = await submitLessonAnswerAction(current.id, Number(selected));
      setResult(state);
      if (state.status === 'correct' && state.reward) {
        setSessionCoins((c) => c + state.reward!);
        toast.success(`+${state.reward} coin qazandınız`);
        // Live-updates the navbar CoinBadge without a page refresh — same
        // contract app/chat/ChatClient.tsx uses after each message's coin
        // spend (see components/CoinBadge.tsx's window listener).
        if (state.balance != null) {
          window.dispatchEvent(new CustomEvent('coin-balance-update', { detail: { balance: state.balance } }));
        }
      }
    });
  }

  function handleNext() {
    setSelected(null);
    setResult(null);
    setIndex((i) => i + 1);
  }

  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="text-headline-md">{category}</h1>
        <p className="mt-4 text-body-lg text-on-surface-variant">
          Bu kateqoriya üzrə hələ dərc edilmiş sual yoxdur.
        </p>
        <Link href="/oyrenme" className={buttonVariants({ variant: 'primary', size: 'md' }) + ' mt-6'}>
          Dərslərə qayıt
        </Link>
      </div>
    );
  }

  if (isDone) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <div className="glass-card mx-auto flex size-16 items-center justify-center rounded-full bg-go-green/15 text-go-green">
          <CheckIcon width={32} height={32} strokeWidth={3} />
        </div>
        <h1 className="mt-6 text-headline-md">{category} tamamlandı</h1>
        <p className="mt-2 text-body-lg text-on-surface-variant">
          {alreadyCompletedCount}/{questions.length} sual düzgün cavablandırılıb.
        </p>
        {sessionCoins > 0 && (
          <div className="mx-auto mt-6 flex w-fit items-center gap-2 rounded-full bg-safety-yellow/15 px-4 py-2 text-safety-yellow">
            <CoinIcon />
            <span className="font-semibold">Bu seansda +{sessionCoins} coin qazandınız</span>
          </div>
        )}
        <Link href="/oyrenme" className={buttonVariants({ variant: 'primary', size: 'md' }) + ' glow-primary mt-6'}>
          Dərslərə qayıt
        </Link>
      </div>
    );
  }

  const isAnswered = result != null;
  const canAdvance = isAnswered;

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/oyrenme" className="text-label-sm text-on-surface-variant hover:text-primary">
          ← Dərslərə qayıt
        </Link>
        <span className="mono-label text-on-surface-variant">
          Sual {index + 1}/{questions.length}
        </span>
      </div>

      <div className="mb-6 h-1.5 w-full overflow-hidden rounded-full bg-surface-tertiary">
        <div
          className="h-full rounded-full bg-go-green transition-all"
          style={{ width: `${(index / questions.length) * 100}%` }}
        />
      </div>

      <div className="glass-card rounded-2xl p-6 space-y-4">
        <h1 className="text-headline-md text-[18px]">{category}</h1>
        <p className="text-body-lg text-on-surface">{current!.question}</p>

        <RadioGroup value={selected ?? undefined} onChange={setSelected} isDisabled={isAnswered || isPending}>
          {current!.options.map((option, i) => (
            <Radio key={i} value={String(i)}>
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                {option}
              </Radio.Content>
            </Radio>
          ))}
        </RadioGroup>

        {result && (
          <Alert status={STATUS_TO_ALERT[result.status]}>
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>
                {result.message}
                {result.explanation && <span className="mt-1 block text-on-surface-variant">{result.explanation}</span>}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {!canAdvance ? (
          <Button variant="primary" onPress={handleSubmit} isDisabled={selected == null} isPending={isPending}>
            {({ isPending: pending }) => (
              <>
                {pending ? <Spinner size="sm" tone="current" /> : null}
                Cavabla
              </>
            )}
          </Button>
        ) : (
          <Button variant="primary" onPress={handleNext} className="glow-primary">
            {index + 1 < questions.length ? 'Növbəti sual' : 'Nəticələrə bax'}
          </Button>
        )}
      </div>
    </div>
  );
}
