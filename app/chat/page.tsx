import { isVisionAvailable } from '@/lib/llm';
import ChatClient from './ChatClient';

// Id-less "new chat" landing state. See app/chat/[id]/page.tsx for the
// existing-conversation route and ChatClient's header comment for how the
// two stay in sync once a conversation id is assigned server-side.
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { q } = await searchParams;
  return (
    <ChatClient
      conversationId={null}
      visionAvailable={isVisionAvailable()}
      initialInput={typeof q === 'string' ? q : undefined}
    />
  );
}
