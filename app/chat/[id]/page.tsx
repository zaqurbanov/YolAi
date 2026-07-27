import { isVisionAvailable } from '@/lib/llm';
import ChatClient from '../ChatClient';
import DesignSwitch from '@/components/design3d/DesignSwitch';
import ChatHud from '@/components/design3d/ChatHud';

// key={id} forces a full remount (fresh history fetch, fresh transport ref)
// whenever the user navigates between two *different* existing
// conversations (sidebar click, "+ Yeni söhbət") — that's a real
// router.push, not the in-place history.replaceState used for the
// id-less-landing-page-gets-its-first-id case (see ChatClient).
//
// Same single-instance-reused-in-both-DesignSwitch-branches pattern as
// app/chat/page.tsx — see that file's comment.
export default async function ChatConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const chatClient = <ChatClient key={id} conversationId={id} visionAvailable={isVisionAvailable()} />;
  return <DesignSwitch simple={chatClient} threeD={<ChatHud>{chatClient}</ChatHud>} />;
}
