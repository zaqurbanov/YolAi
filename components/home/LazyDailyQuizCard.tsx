'use client';

import dynamic from 'next/dynamic';
import type { StreakStatus } from '@/lib/coins/quiz';
import { useInViewOnce } from './useInViewOnce';

const DailyQuizCard = dynamic(() => import('@/components/account/DailyQuizCard'));

interface LazyDailyQuizCardProps {
  question: string;
  options: string[];
  alreadyClaimed: boolean;
  reward: number;
  streakStatus: StreakStatus;
}

/**
 * Home-route-only lazy version of components/account/DailyQuizCard. Defers the
 * card's JS (including its @heroui RadioGroup/Radio/Button/Alert imports and
 * the claimDailyQuizReward server action reference) until the card scrolls
 * near the viewport. All props are serializable and already what the static
 * card received — initial state (selected/result/streak) is derived from them
 * exactly as before, just on mount-after-reveal instead of on page load.
 */
export default function LazyDailyQuizCard(props: LazyDailyQuizCardProps) {
  const { ref, revealed } = useInViewOnce<HTMLDivElement>();

  return (
    <div ref={ref}>
      {revealed ? (
        <DailyQuizCard {...props} />
      ) : (
        <div
          aria-hidden="true"
          className="rounded-2xl border border-border/40 bg-surface-tertiary/30"
          style={{ minHeight: 500 }}
        />
      )}
    </div>
  );
}
