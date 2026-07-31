import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getCoinBalanceStatus } from '@/lib/chat/coins';
import { getEnergyStatus } from '@/lib/coins/games';
import { getExamEntryPricing } from '@/lib/exam/examPricing';
import { getExamHistory } from '@/lib/exam/examHistory';
import OfficialExamClient from './OfficialExamClient';

export const metadata: Metadata = {
  title: 'Rəsmi İmtahan',
};

// "Rəsmi İmtahan" — the exam simulation as its own destination, reachable from
// the mobile bottom tab bar. It reuses the ENTIRE existing exam backend
// (exam_sessions + start_exam_session/settle_exam_session from
// 0082_exam_simulator.sql, lib/exam/examPool.ts, lib/exam/examSession.ts and
// the two server actions in app/coin-qazan/actions.ts) — the questions, the
// pricing, the server-authoritative grading and the anti-double-submit
// guarantees are all shared with the games-section simulator, so the two can
// never drift apart. What is new here is the destination, the exam-room UI,
// and question images (0090_exam_question_images.sql).
//
// proxy.ts guards /imtahan, but that check is cookie-only by design — the real
// auth check is the getUser() below, matching every other page in the app.
export default async function ImtahanPage() {
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

  // Admins are exempt from the coin economy everywhere else in the app
  // (app/coin-qazan/page.tsx redirects them), and the exam costs coins or
  // energy — so there is nothing here they can meaningfully do.
  if (profile?.role === 'admin') redirect('/account');

  const [coinStatus, energyStatus, pricing, history] = await Promise.all([
    getCoinBalanceStatus(user.id),
    getEnergyStatus(user.id),
    getExamEntryPricing(),
    getExamHistory(user.id),
  ]);

  return (
    <OfficialExamClient
      initialBalance={coinStatus.balance}
      initialEnergy={energyStatus.balance}
      maxEnergy={energyStatus.max}
      coinPrice={pricing.coinPrice}
      energyCost={pricing.energyCost}
      passThreshold={pricing.passThreshold}
      history={history}
    />
  );
}
