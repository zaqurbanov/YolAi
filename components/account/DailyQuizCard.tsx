'use client';

import { useState, useTransition } from 'react';
import { RadioGroup, Radio, Button, Alert } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { claimDailyQuizReward, type QuizClaimState } from '@/app/chat/actions';

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
      <div className="flex items-center justify-between gap-4">
        <h2 className="mono-label uppercase text-on-surface-variant">Bugünkü sual</h2>
        {!isLocked && <span className="mono-label text-xs text-on-surface-variant">+{reward} coin</span>}
      </div>
      <p className="text-sm text-on-surface">{question}</p>

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
