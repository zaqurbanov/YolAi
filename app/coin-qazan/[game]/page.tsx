import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getCoinBalanceStatus } from '@/lib/chat/coins';
import {
  getEnergyStatus,
  getEnergyPurchaseConfig,
  getTicTacToeTodayCount,
  getTicTacToeWinReward,
} from '@/lib/coins/games';
import { GAMES, isGameSlug } from '@/lib/coins/gameCatalog';
import GamePageShell from '@/components/games/GamePageShell';

// ONE dynamic route for all three games (see lib/coins/gameCatalog.ts's header
// for why it is not three sibling routes). params is a Promise in Next.js 16.
interface GamePageProps {
  params: Promise<{ game: string }>;
}

export async function generateMetadata({ params }: GamePageProps): Promise<Metadata> {
  const { game } = await params;
  if (!isGameSlug(game)) return { title: 'Oyun' };
  return { title: GAMES[game].title };
}

export default async function GamePage({ params }: GamePageProps) {
  const { game } = await params;
  if (!isGameSlug(game)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  // Admins are coin-exempt everywhere else in the app and /coin-qazan already
  // bounces them, so the games it links to do the same rather than showing a
  // meter that can never move.
  if (profile?.role === 'admin') redirect('/account');

  const [coinStatus, energyStatus, todayCount, winReward, energyPurchaseConfig] = await Promise.all([
    getCoinBalanceStatus(user.id),
    getEnergyStatus(user.id),
    getTicTacToeTodayCount(user.id),
    getTicTacToeWinReward(),
    getEnergyPurchaseConfig(),
  ]);

  return (
    <GamePageShell
      meta={GAMES[game]}
      initialBalance={coinStatus.balance}
      initialEnergy={energyStatus.balance}
      maxEnergy={energyStatus.max}
      initialTodayCount={todayCount}
      winReward={winReward}
      energyPurchaseConfig={energyPurchaseConfig}
    />
  );
}
