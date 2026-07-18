import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, notFound, serverError, unauthorized } from '@/lib/api/errors';
import { getCoinBalanceStatus, DEFAULT_DAILY_LIMIT } from '@/lib/chat/coins';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);

  if (searchParams.get('type') === 'quota') {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (error) return serverError(error, 'Profil məlumatı alınmadı');

    if (profile.role === 'admin') {
      return Response.json({ exempt: true });
    }

    const { balance, dailyLimit, price, msUntilReset } = await getCoinBalanceStatus(user.id);

    return Response.json({
      exempt: false,
      balance,
      dailyLimit: dailyLimit ?? DEFAULT_DAILY_LIMIT,
      price,
      msUntilReset,
    });
  }

  const conversationId = searchParams.get('conversationId');

  if (!conversationId) {
    // Untitled conversations are always empty (title is only ever set once
    // the first message lands — see app/api/chat/route.ts's auto-title
    // logic) and are meant to be transient: a "+ Yeni söhbət" click that
    // never got a first message shouldn't clutter the sidebar as a ghost
    // "Untitled" entry. Excluding them here is the read-side half of that;
    // the write-side half (actually deleting them) happens below when their
    // own conversationId is fetched and found empty.
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, title, created_at, updated_at')
      .eq('user_id', user.id)
      .not('title', 'is', null)
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

  // Unnamed conversations are always meant to be temporary — a
  // "+ Yeni söhbət" click that's never actually used (no message ever sent,
  // so title was never auto-set — see app/api/chat/route.ts) shouldn't
  // survive a page refresh as an empty, permanent row. Deleting here (rather
  // than only hiding it from the list above) means visiting its URL again
  // — the exact "create then refresh" scenario — cleans it up and reports
  // 404, which ChatClient.tsx's history-load effect already treats as
  // "start a fresh new chat" (router.replace('/chat')), so no separate
  // client-side handling is needed for this.
  if ((messages ?? []).length === 0) {
    await supabase.from('conversations').delete().eq('id', conversationId).eq('user_id', user.id);
    return notFound('Söhbət tapılmadı');
  }

  return Response.json({ messages: messages ?? [], title: conversation.title });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);

  if (searchParams.get('action') === 'share') {
    const conversationId = searchParams.get('conversationId');
    if (!conversationId) {
      return apiError(400, 'conversationId parametri tələb olunur', { code: 'missing_conversation_id' });
    }

    const { data: existing, error: fetchError } = await supabase
      .from('conversations')
      .select('share_token')
      .eq('id', conversationId)
      .maybeSingle();

    if (fetchError) return serverError(fetchError, 'Söhbəti paylaşmaq uğursuz oldu');

    let token = existing?.share_token ?? null;

    if (!token) {
      token = crypto.randomBytes(24).toString('base64url');

      // RLS conversations_update_own (0004) scopes this to auth.uid() = user_id,
      // so this can only ever touch the caller's own conversation.
      const { error: updateError } = await supabase
        .from('conversations')
        .update({ share_token: token })
        .eq('id', conversationId)
        .eq('user_id', user.id);

      if (updateError) return serverError(updateError, 'Söhbəti paylaşmaq uğursuz oldu');
    }

    return Response.json({ url: `/share/${token}` });
  }

  // Opportunistic cleanup: an untitled conversation is by definition empty
  // (title is only ever set alongside the first message — see
  // app/api/chat/route.ts) and meant to be temporary. A user who repeatedly
  // clicks "+ Yeni söhbət" without sending anything would otherwise leave
  // orphaned empty rows behind indefinitely (the refresh-time cleanup in the
  // GET handler above only fires if that exact draft's URL is revisited) —
  // clearing them here, right before starting a fresh draft, keeps at most
  // one abandoned empty conversation alive at a time instead of
  // accumulating. Not scoped to `error`-checked since a failed cleanup
  // shouldn't block creating the new conversation.
  await supabase.from('conversations').delete().eq('user_id', user.id).is('title', null);

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
