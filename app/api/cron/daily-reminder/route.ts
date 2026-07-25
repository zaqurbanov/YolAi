import { NextResponse, type NextRequest } from 'next/server';
import { broadcastDailyReminder } from '@/lib/push/broadcast';

// Deliberate NEW serverless function. The app is already over the Hobby
// 12-function budget (see CLAUDE.md) — flagged, not avoidable: Vercel Cron
// only invokes an HTTP endpoint, so scheduled work requires a route.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const REMINDER_PAYLOAD = { title: 'YOL', body: 'Bugünkü sualın səni gözləyir 🚦' };

// Vercel Cron sends a GET with `Authorization: Bearer <CRON_SECRET>`.
export async function GET(request: NextRequest) {
  // FIRST: this endpoint sends a push to every un-answered user, so it must
  // never be publicly triggerable. Unset secret OR mismatch → 401 immediately.
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await broadcastDailyReminder({
      onlyUnclaimed: true,
      payload: REMINDER_PAYLOAD,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error('[cron/daily-reminder] broadcast failed', err);
    return NextResponse.json({ error: 'Broadcast failed' }, { status: 500 });
  }
}
