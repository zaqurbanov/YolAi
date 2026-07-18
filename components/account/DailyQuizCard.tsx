'use client';

import { useState, useTransition } from 'react';
import { RadioGroup, Radio, Button, Alert } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { claimDailyQuizReward, type QuizClaimState } from '@/app/chat/actions';
import { CoinIcon } from '@/components/icons';

interface DailyQuizCardProps {
  question: string;
  options: string[];
  alreadyClaimed: boolean;
  reward: number;
}

// Client component consuming the claimDailyQuizReward server action directly
// (not useActionState — that action takes a plain number argument, not
// (prevState, formData), per the task brief). correctIndex is intentionally
// absent from props: the server action re-derives it server-side from
// (userId, today) so it's never present in this client bundle.
export default function DailyQuizCard({ question, options, alreadyClaimed, reward }: DailyQuizCardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<QuizClaimState | null>(
    alreadyClaimed ? { status: 'already_claimed', message: 'Artıq bugün sualı cavablandırmısınız' } : null
  );
  const [isPending, startTransition] = useTransition();

  const isDone = result != null && result.status !== 'idle';
  const isLocked = alreadyClaimed || isDone;

  function handleSubmit() {
    if (selected == null) return;
    startTransition(async () => {
      const state = await claimDailyQuizReward(Number(selected));
      setResult(state);
    });
  }

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 border-b border-outline-variant/30 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-go-green/15 text-go-green">
            <CoinIcon />
          </div>
          <h2 className="text-headline-md text-[18px]">Bugünkü sual</h2>
        </div>
        {!isLocked && (
          <span className="text-legal-citation rounded-full bg-safety-yellow/15 px-2.5 py-1 text-safety-yellow">
            +{reward} coin
          </span>
        )}
      </div>
      <p className="text-body-lg text-on-surface">{question}</p>

      <RadioGroup
        value={selected ?? undefined}
        onChange={setSelected}
        isDisabled={isLocked || isPending}
      >
        {options.map((option, index) => (
          <Radio key={index} value={String(index)}>
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
        <Alert status={result.status === 'correct' ? 'success' : result.status === 'error' ? 'danger' : 'warning'}>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{result.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {!isLocked && (
        <Button variant="primary" onPress={handleSubmit} isDisabled={selected == null} isPending={isPending}>
          {({ isPending: pending }) => (
            <>
              {pending ? <Spinner size="sm" tone="current" /> : null}
              Cavabla
            </>
          )}
        </Button>
      )}
    </div>
  );
}
