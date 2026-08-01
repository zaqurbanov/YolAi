'use client';

import { useRef, useState, useTransition } from 'react';
import Image from 'next/image';
import { RadioGroup, Radio, Button, Alert, toast } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { claimDailyQuizReward, type QuizClaimState } from '@/app/chat/actions';
import { EnergyIcon, FlameIcon } from '@/components/icons';
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
      // Live-updates the navbar badges without a page refresh. Since 0094
      // the quiz pays ENERGY: `balance` (coins) is unchanged and is still
      // forwarded so the coin badge re-syncs with the server's latest value
      // (same contract app/chat/ChatClient.tsx uses after a message's spend);
      // `energy` is the new ENERGY balance, which the EnergyBadge needs.
      if (state.status === 'correct' && state.balance != null) {
        window.dispatchEvent(new CustomEvent('coin-balance-update', { detail: { balance: state.balance } }));
      }
      if (state.status === 'correct' && state.energy != null) {
        window.dispatchEvent(new CustomEvent('energy-balance-update', { detail: { balance: state.energy } }));
      }
      if (state.status === 'correct' && state.streak != null) {
        setLiveStreak(state.streak);
      }
      // Celebrate a milestone via the app-wide HeroUI toast (Toast.Provider is
      // mounted in app/layout.tsx) — same mechanism ChatClient/ReferralCard use.
      if (state.status === 'correct' && state.milestoneBonus && state.milestoneBonus > 0) {
        toast.success(`🔥 ${state.streak} günlük seriya!`, {
          description: `+${state.milestoneBonus} bonus enerji qazandınız`,
          indicator: <FlameIcon />,
        });
      }
    });
  }

  return (
    <div ref={cardRef} data-tour="daily-quiz-card" className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 border-b border-outline-variant/30 pb-4">
        <div className="flex items-center gap-3">
          {/* Raster icon, so no tinted chip behind it: a PNG carries its own
              colours and can't inherit `text-go-green` the way the stroke SVG
              it replaced did — a coloured chip would fight the artwork. */}
          <Image
            src="/icons/question-icon.png"
            alt=""
            width={40}
            height={40}
            className="size-10 shrink-0 object-contain"
          />
          <h2 className="text-headline-md text-[18px]">Bugünkü sual</h2>
        </div>
        {!isLocked && (
          <span className="text-legal-citation inline-flex items-center gap-1 rounded-full bg-caution-orange/15 px-2.5 py-1 text-caution-orange">
            <EnergyIcon width={12} height={12} />+{reward} enerji
          </span>
        )}
      </div>

      <div className="rounded-xl border border-outline-variant/30 bg-caution-orange/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {/* Same streak-flame animation as the SVG it replaced (scale
                1 → 1.08 → 0.97, 2s loop, origin at the base so it flickers
                like a flame rather than pulsing like a dot). No tinted chip
                behind it: the PNG carries its own colours and can't inherit
                text-caution-orange. */}
            <Image
              src="/icons/flame-icon.png"
              alt=""
              width={36}
              height={36}
              className={`size-9 shrink-0 object-contain ${
                liveStreak > 0 ? 'streak-flame motion-reduce:animate-none' : 'opacity-60'
              }`}
            />
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
                ? `${remaining} gün sonra +${nextMilestoneBonus} bonus enerji`
                : `+${nextMilestoneBonus} bonus enerji hazırdır!`}
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
