import type { ReactNode } from 'react';
import RoadShaderBackground from '@/components/design3d/RoadShaderBackground';

interface ChatHudProps {
  children: ReactNode;
}

// Chrome-only wrapper for the chat page's "3D" (Cyber-Circuit Legal) design.
// Unlike HomePage3D/CoinQazanPage3D/OyrenmePage3D, ChatClient
// (app/chat/ChatClient.tsx) is a single ~1600-line client component
// (useChat streaming, citations, coin debit, image attach, share/delete
// dialogs, admin log modal) that is NOT split into per-section ReactNode
// props — forking it into a second full JSX tree would duplicate that
// logic. So this component supplies ONLY the surrounding HUD frame (fixed
// shader backdrop + legibility veil, max-w-7xl outer bound) around the SAME
// <ChatClient/> instance also used for "sadə dizayn" (see app/chat/page.tsx
// / app/chat/[id]/page.tsx, which pass one ChatClient element to both the
// `simple` and `threeD` branches of DesignSwitch — only one ever mounts).
// The actual re-skin of ChatClient's header/bubbles/composer/dialogs is
// `[data-design='3d'] .chat-hud-shell` CSS in app/globals.css, targeting the
// classes ChatClient already renders.
export default function ChatHud({ children }: ChatHudProps) {
  return (
    <div
      className="relative flex flex-1 min-h-0 flex-col"
      style={{ color: 'var(--hud-on-surface)', fontFamily: 'var(--hud-font-body)' }}
    >
      {/* Same fixed shader backdrop + legibility veil as HomePage3D/CoinQazanPage3D/OyrenmePage3D. */}
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--hud-bg-deep)' }} aria-hidden="true">
        <RoadShaderBackground className="absolute inset-0 h-full w-full" />
      </div>
      <div
        className="fixed inset-0 -z-10"
        style={{ background: 'color-mix(in oklab, var(--hud-bg-deep) 55%, transparent)' }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 min-h-0 flex-col">{children}</div>
    </div>
  );
}
