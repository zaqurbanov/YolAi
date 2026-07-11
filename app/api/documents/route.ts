import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { unauthorized, serverError } from '@/lib/api/errors';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const { data, error } = await supabase
    .from('documents')
    .select('id, title')
    .eq('status', 'ready')
    .order('title', { ascending: true });

  if (error) return serverError(error, 'Sənədləri yükləmək uğursuz oldu');
  return NextResponse.json({ documents: data });
}
