import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { unauthorized, serverError } from '@/lib/api/errors';
import { getChatQuotaStatus } from '@/lib/chat/rateLimit';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, custom_max_per_day')
    .eq('id', user.id)
    .single();

  if (error) return serverError(error, 'Profil məlumatı alınmadı');

  if (profile.role === 'admin') {
    return NextResponse.json({ exempt: true });
  }

  const { used, max } = await getChatQuotaStatus(user.id, profile.custom_max_per_day);
  const remaining = Math.max(0, max - used);

  return NextResponse.json({ exempt: false, used, max, remaining });
}
