'use client';

import { useRef, useState, useTransition } from 'react';
import { RadioGroup, Radio, Button, Alert, toast } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { claimDailyQuizReward, type QuizClaimState } from '@/app/chat/actions';
import { CoinIcon, FlameIcon } from '@/components/icons';
import type { StreakStatus } from '@/lib/coins/quiz';

interface DailyQuizCardProps {
  question: string;
  options: string[];
  alreadyClaimed: boolean;
  reward: number;
  streakStatus: StreakStatus;
}

// Client component consuming the claimDailyQuizReward server action directly
// (not useActionState — that action takes a plain number argument, not
// (prevState, formData), per the task brief). correctIndex is intentionally
// absent from props: the server action re-derives it server-side from
// (userId, today) so it's never present in this client bundle.
export default function DailyQuizCard({ question, options, alreadyClaimed, reward, streakStatus }: DailyQuizCardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<QuizClaimState | null>(
    alreadyClaimed ? { status: 'already_claimed', message: 'Artıq bugün sualı cavablandırmısınız' } : null
  );
  // Optimistically reflects the new streak after a correct claim so the
  // indicator feels live like the navbar CoinBadge (the page also revalidates).
  const [liveStreak, setLiveStreak] = useState(streakStatus.current);
  const [isPending, startTransition] = useTransition();
  const cardRef = useRef<HTMLDivElement>(null);

  const isDone = result != null && result.status !== 'idle';
  const isLocked = alreadyClaimed || isDone;

  const { longest, nextMilestone, nextMilestoneBonus } = streakStatus;
  const streakLabel =
    liveStreak <= 0 ? 'Seriyanı bu gün başlat' : `${liveStreak} gün ardıcıl`;
  const isMaxed = nextMilestone == null && liveStreak > 0;
  const remaining = nextMilestone != null ? Math.max(0, nextMilestone - liveStreak) : 0;
  const progressPct = nextMilestone != null ? Math.min(100, Math.round((liveStreak / nextMilestone) * 100)) : 0;

  function handleSubmit() {
    if (selected == null) return;
    startTransition(async () => {
      const state = await claimDailyQuizReward(Number(selected));
      setResult(state);
      // Live-updates the navbar CoinBadge without a page refresh — same
      // contract app/chat/ChatClient.tsx uses after each message's coin
      // spend (see components/CoinBadge.tsx's window listener).
      if (state.status === 'correct' && state.balance != null) {
        window.dispatchEvent(new CustomEvent('coin-balance-update', { detail: { balance: state.balance } }));
      }
      if (state.status === 'correct' && state.streak != null) {
        setLiveStreak(state.streak);
      }
      // Celebrate a milestone via the app-wide HeroUI toast (Toast.Provider is
      // mounted in app/layout.tsx) — same mechanism ChatClient/ReferralCard use.
      if (state.status === 'correct' && state.milestoneBonus && state.milestoneBonus > 0) {
        toast.success(`🔥 ${state.streak} günlük seriya!`, {
          description: `+${state.milestoneBonus} bonus coin qazandınız`,
          indicator: <FlameIcon />,
        });
      }
    });
  }

  return (
    <div ref={cardRef} data-tour="daily-quiz-card" className="glass-card rounded-2xl p-6 space-y-4">
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

      <div className="rounded-xl border border-outline-variant/30 bg-caution-orange/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-caution-orange/15 text-caution-orange">
              <FlameIcon width={20} height={20} />
            </div>
            <div>
              <p className="text-body-md font-medium text-on-surface">{streakLabel}</p>
              {longest > 0 && (
                <p className="text-legal-citation text-on-surface-variant">Ən uzun: {longest} gün</p>
              )}
            </div>
          </div>
          {isMaxed && (
            <span className="text-legal-citation rounded-full bg-safety-yellow/15 px-2.5 py-1 text-safety-yellow">
              Maksimum seriya!
            </span>
          )}
        </div>

        {nextMilestone != null && nextMilestoneBonus != null && (
          <div className="mt-3 space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-outline-variant/30">
              <div
                className="h-full rounded-full bg-caution-orange transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-legal-citation text-on-surface-variant">
              {remaining > 0
                ? `${remaining} gün sonra +${nextMilestoneBonus} bonus coin`
                : `+${nextMilestoneBonus} bonus coin hazırdır!`}
            </p>
          </div>
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
