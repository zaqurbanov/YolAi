import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, notFound, serverError, unauthorized } from '@/lib/api/errors';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get('conversationId');

  if (!conversationId) {
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, title, created_at, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });

    if (error) return serverError(error, 'Söhbətlər siyahısını yükləmək uğursuz oldu');

    return Response.json({ conversations: conversations ?? [] });
  }

  // RLS (conversations_select_own) is the real enforcement layer here; the
  // .eq('user_id', ...) below is defense-in-depth, not a substitute for it.
  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id, title')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (conversationError) return serverError(conversationError, 'Söhbəti yükləmək uğursuz oldu');
  if (!conversation) return notFound('Söhbət tapılmadı');

  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, role, content, citations, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) return serverError(error, 'Söhbət tarixçəsini yükləmək uğursuz oldu');

  return Response.json({ messages: messages ?? [], title: conversation.title });
}

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({ user_id: user.id, title: null })
    .select('id')
    .single();

  if (error) return serverError(error, 'Yeni söhbət yaratmaq uğursuz oldu');

  return Response.json({ id: created.id }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const body = await request.json().catch(() => null);
  const conversationId = body?.conversationId;
  const title = body?.title;

  if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
    return apiError(400, 'conversationId tələb olunur');
  }
  if (typeof title !== 'string' || title.trim().length === 0) {
    return apiError(400, 'title boş ola bilməz');
  }
  if (title.length > 200) {
    return apiError(400, 'title 200 simvoldan uzun ola bilməz');
  }

  const trimmedTitle = title.trim();

  // RLS conversations_update_own (0004) is the real enforcement layer here
  // (same policy the share_token flow already relies on); the
  // .eq('user_id', ...) below is defense-in-depth, not a substitute for it.
  const { error, count } = await supabase
    .from('conversations')
    .update({ title: trimmedTitle }, { count: 'exact' })
    .eq('id', conversationId)
    .eq('user_id', user.id);

  if (error) return serverError(error, 'Söhbətin adını dəyişmək uğursuz oldu');
  if (!count) {
    return apiError(403, 'Söhbətin adını dəyişmək mümkün olmadı', { code: 'forbidden' });
  }

  return Response.json({ title: trimmedTitle });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const conversationId = searchParams.get('conversationId');

  if (!conversationId) {
    return apiError(400, 'conversationId tələb olunur');
  }

  // RLS (conversations_delete_own, 0005) is the real enforcement layer here;
  // the .eq('user_id', ...) below is defense-in-depth, not a substitute for it.
  const { error, count } = await supabase
    .from('conversations')
    .delete({ count: 'exact' })
    .eq('id', conversationId)
    .eq('user_id', user.id);

  if (error) return serverError(error, 'Söhbəti silmək uğursuz oldu');
  if (!count) {
    return apiError(403, 'Söhbəti silmək mümkün olmadı', { code: 'forbidden' });
  }

  return Response.json({ deleted: true });
}
