import ChatClient from '../ChatClient';

// key={id} forces a full remount (fresh history fetch, fresh transport ref)
// whenever the user navigates between two *different* existing
// conversations (sidebar click, "+ Yeni söhbət") — that's a real
// router.push, not the in-place history.replaceState used for the
// id-less-landing-page-gets-its-first-id case (see ChatClient).
export default async function ChatConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <ChatClient key={id} conversationId={id} />;
}
