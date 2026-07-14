import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { unauthorized, serverError } from '@/lib/api/errors';
import { getCoinBalanceStatus, DEFAULT_DAILY_LIMIT } from '@/lib/chat/coins';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error) return serverError(error, 'Profil məlumatı alınmadı');

  if (profile.role === 'admin') {
    return NextResponse.json({ exempt: true });
  }

  const { balance, dailyLimit, price } = await getCoinBalanceStatus(user.id);

  return NextResponse.json({
    exempt: false,
    balance,
    dailyLimit: dailyLimit ?? DEFAULT_DAILY_LIMIT,
    price,
  });
}
