import { isVisionAvailable } from '@/lib/llm';
import ChatClient from './ChatClient';
import DesignSwitch from '@/components/design3d/DesignSwitch';
import ChatHud from '@/components/design3d/ChatHud';

// Id-less "new chat" landing state. See app/chat/[id]/page.tsx for the
// existing-conversation route and ChatClient's header comment for how the
// two stay in sync once a conversation id is assigned server-side.
//
// Same "build the element once, reuse it in both DesignSwitch branches"
// pattern as app/coin-qazan/page.tsx — DesignSwitch only ever mounts one of
// `simple`/`threeD` at a time, so ChatClient (all its streaming/coin/image
// state) is still instantiated exactly once regardless of which design is
// active. See components/design3d/ChatHud.tsx for why chat isn't split into
// per-section ReactNode props the way Home/CoinQazan/Öyrənmə are.
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { q } = await searchParams;
  const chatClient = (
    <ChatClient
      conversationId={null}
      visionAvailable={isVisionAvailable()}
      initialInput={typeof q === 'string' ? q : undefined}
    />
  );
  return <DesignSwitch simple={chatClient} threeD={<ChatHud>{chatClient}</ChatHud>} />;
}
