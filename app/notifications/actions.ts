'use server';

import { createClient } from '@/lib/supabase/server';
import { markNotificationRead } from '@/lib/notifications/notifications';

// No revalidatePath here on purpose — this is expected to be called from a
// shared layout-level component (e.g. a notification bell) that could live
// on almost any page, so there's no single obviously-correct path to
// revalidate. Frontend should decide whether to revalidatePath at the call
// site, use router.refresh(), or optimistically update local state.
export async function markNotificationReadAction(
  notificationId: string
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false };

  return markNotificationRead(notificationId, user.id);
}
