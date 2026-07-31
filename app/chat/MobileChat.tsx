'use client';

import type { UIMessage } from 'ai';
import { memo, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Input, Button, Drawer, Dropdown, Label } from '@heroui/react';
import {
  SendIcon,
  GavelIcon,
  CloseIcon,
  PaperclipIcon,
  MicIcon,
  ArrowRightIcon,
  ClockIcon,
  CameraIcon,
  ImageIcon,
  ShareIcon,
} from '@/components/icons';
import MobileBottomTabBar from '@/components/home/MobileBottomTabBar';
import { ChatConversationList } from '@/components/ChatConversationList';
import { Spinner } from '@/components/Spinner';
import { renderCitationText } from '@/lib/chat/renderCitationText';

export interface MobileCitation {
  document_id: string;
  title: string;
  page: number | null;
  article_label: string | null;
  excerpt?: string;
}

export interface MobileChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: UIMessage['parts'];
  citations?: MobileCitation[];
}

export interface MobileChatProps {
  messages: MobileChatMessage[];
  timestampFor: (id: string) => string;
  isBusy: boolean;
  isStreamingId: string | null;
  historyLoaded: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  visionAvailable: boolean;
  attachedPreviewUrl: string | null;
  /** Opens the gallery picker (the plain file input). */
  onAttachClick: () => void;
  /**
   * Opens the camera directly (the `capture="environment"` input). Mobile had
   * no camera path at all before — the attach button only ever triggered the
   * gallery input, because the camera/gallery choice lived inside ChatClient's
   * `hidden md:flex` desktop tree.
   */
  onCameraClick: () => void;
  onClearAttachedFile: () => void;
  /**
   * Same handler the desktop header's share menu uses (ChatClient's
   * handleShareAction) — passed in rather than reimplemented so the share-link
   * creation, the text/PDF export and the native-share fallback all stay in
   * one place.
   */
  onShareAction: (key: React.Key) => void;
  /** Whether navigator.share exists, so the native option can be hidden. */
  canNativeShare: boolean;
  /** Share is meaningless with nothing in the thread. */
  hasMessages: boolean;
  isResizingImage: boolean;
  messageInputRef?: React.Ref<HTMLInputElement>;
  scrollContainerRef?: React.Ref<HTMLDivElement>;
  bottomSentinelRef?: React.Ref<HTMLDivElement>;
}

// Re-parsing citation/excerpt markup on every render is cheap in absolute
// terms but still O(n) per token delta for no reason once text stops
// changing — same reasoning as ChatClient.tsx's TextPart, duplicated here
// rather than shared because the two components don't otherwise share JSX.
function TextPart({ text }: { text: string }) {
  const nodes = useMemo(() => renderCitationText(text), [text]);
  return <span className="whitespace-pre-wrap">{nodes}</span>;
}

// Collapsed-state excerpt length for the citation card. Chunks range roughly
// 200-3200 chars (lib/ingestion/chunkText.ts's MAX_CHARS); showing the full
// excerpt collapsed would blow out the chat bubble, so this trims to a
// single-paragraph-ish preview and lets "Tam oxu" reveal the rest. Cuts on
// a word boundary rather than mid-word.
const EXCERPT_COLLAPSED_LENGTH = 180;

function collapseExcerpt(excerpt: string): { preview: string; truncated: boolean } {
  if (excerpt.length <= EXCERPT_COLLAPSED_LENGTH) {
    return { preview: excerpt, truncated: false };
  }
  const cut = excerpt.slice(0, EXCERPT_COLLAPSED_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  const preview = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd();
  return { preview, truncated: true };
}

// Law-citation card: built strictly from the real `citations` array (document
// title / article_label / page / excerpt from actual retrieval, via
// buildCitations() in lib/rag/buildPrompt.ts — `excerpt` is the real
// retrieved chunk content, whitespace-normalized and untruncated at the
// source; truncation here is presentation-only). Mirrors the Stitch mockup's
// anatomy (gavel icon + heading, italic quoted excerpt, source label + "Tam
// oxu" action) but re-skinned onto the app's own theme tokens, and "Tam oxu"
// is a local expand/collapse toggle rather than a link — there is no public
// document-viewer route in this app.
function CitationCard({ citation }: { citation: MobileCitation }) {
  const [expanded, setExpanded] = useState(false);
  const hasExcerpt = Boolean(citation.excerpt && citation.excerpt.trim().length > 0);
  const { preview, truncated } = hasExcerpt
    ? collapseExcerpt(citation.excerpt!.trim())
    : { preview: '', truncated: false };

  return (
    <div className="glass-panel flex min-w-0 flex-col gap-2.5 rounded-xl border-l-4 border-regulatory-blue px-4 py-3.5 shadow-lg">
      <div className="flex items-center gap-2.5">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-regulatory-blue/15 text-regulatory-blue">
          <GavelIcon width={15} height={15} />
        </div>
        <h3 className="min-w-0 break-words text-body-md font-semibold text-regulatory-blue">
          {citation.article_label ? `${citation.article_label}. ` : ''}
          {citation.title}
        </h3>
      </div>

      {hasExcerpt && (
        <p className="break-words text-sm italic leading-relaxed text-on-surface-variant">
          &ldquo;{expanded ? citation.excerpt!.trim() : preview}
          {!expanded && truncated ? '…' : ''}&rdquo;
        </p>
      )}

      <div className="flex items-center justify-between gap-2 border-t border-outline-variant/20 pt-2.5">
        <span className="text-legal-citation text-on-surface-variant">Rəsmi Mənbə</span>
        <div className="flex items-center gap-2">
          {citation.page != null && (
            <span className="text-legal-citation rounded-full bg-regulatory-blue/10 px-2 py-0.5 text-regulatory-blue">
              s.{citation.page}
            </span>
          )}
          {hasExcerpt && truncated && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="flex items-center gap-1 text-legal-citation text-regulatory-blue hover:underline"
            >
              {expanded ? 'Qısalt' : 'Tam oxu'}
              <ArrowRightIcon
                width={11}
                height={11}
                className={`transition-transform ${expanded ? '-rotate-90' : 'rotate-90'}`}
              />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Compact pill for the multi-citation case: icon + "Maddə NN" only (falls
// back to a truncated title when a chunk has no article_label — the catalog
// splitter in chunkText.ts's splitCodeCatalogEntries() produces entries that
// don't always carry one). Tapping toggles the full CitationCard below the
// pill row open/closed; all real fields (excerpt, source, page) stay reachable
// there, just not shown until tapped.
function CitationChip({
  citation,
  active,
  onClick,
}: {
  citation: MobileCitation;
  active: boolean;
  onClick: () => void;
}) {
  // Truncate whichever source is used. article_label was previously passed
  // through verbatim while only `title` was capped — a long label ("Maddə
  // 61.1.2-ci bəndinə əsasən") then rendered at full width on a shrink-0 chip
  // and pushed past the screen edge.
  const raw = citation.article_label ?? citation.title;
  const label = raw.length > 24 ? `${raw.slice(0, 24).trimEnd()}…` : raw;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={raw}
      // min-w-0 + max-w-full let the chip shrink below its text, and `truncate`
      // ends it with an ellipsis instead of overflowing. shrink-0 was the other
      // half of the overflow — it forbade shrinking entirely.
      className={`flex min-w-0 max-w-full items-center gap-1.5 rounded-full border px-3 py-1.5 text-legal-citation transition ${
        active
          ? 'border-regulatory-blue bg-regulatory-blue/15 text-regulatory-blue'
          : 'glass-panel border-outline-variant/30 text-on-surface-variant hover:text-on-surface'
      }`}
    >
      <GavelIcon width={12} height={12} className={`shrink-0 ${active ? 'text-regulatory-blue' : ''}`} />
      <span className="min-w-0 truncate">{label}</span>
      {citation.page != null && (
        <span className={`shrink-0 ${active ? 'text-regulatory-blue/70' : 'text-on-surface-variant/70'}`}>
          · s.{citation.page}
        </span>
      )}
    </button>
  );
}

// Renders the citations for one assistant message. A single citation keeps
// the original full-card treatment (no chrome to save there). 2+ citations
// collapse to a horizontal row of CitationChip pills — this is what actually
// solves the vertical-space problem, since it's the per-card icon+heading+
// source-row+toggle chrome (not just the excerpt) that was expensive at 2+
// stacked full cards; tapping a pill expands just that citation's full card
// beneath the row, preserving every field, just deferred behind a tap.
function MobileCitations({ citations }: { citations: MobileCitation[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (citations.length <= 1) {
    return (
      <div className="flex w-[88%] flex-col gap-1.5 pt-0.5">
        {citations.map((c, i) => (
          <CitationCard key={i} citation={c} />
        ))}
      </div>
    );
  }

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <div className="flex w-[88%] flex-col gap-2 pt-0.5">
      <div className="flex flex-wrap gap-1.5">
        {citations.map((c, i) => (
          <CitationChip key={i} citation={c} active={expanded.has(i)} onClick={() => toggle(i)} />
        ))}
      </div>
      {citations.map(
        (c, i) => expanded.has(i) && <CitationCard key={i} citation={c} />
      )}
    </div>
  );
}

interface MobileMessageBubbleProps {
  message: MobileChatMessage;
  timestamp: string;
  isStreaming: boolean;
}

const MobileMessageBubble = memo(function MobileMessageBubble({
  message,
  timestamp,
  isStreaming,
}: MobileMessageBubbleProps) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={
          isUser
            ? 'chat-bubble-user max-w-[88%] break-words rounded-2xl rounded-tr-none bg-primary px-4 py-3 text-sm text-on-primary'
            : 'chat-bubble-ai glass-panel max-w-[88%] min-w-0 break-words rounded-2xl rounded-tl-none border-l-2 border-primary px-4 py-3 text-sm text-on-surface'
        }
      >
        {message.parts.map((part, i) => {
          if (part.type === 'file' && part.mediaType?.startsWith('image/')) {
            return (
              // eslint-disable-next-line @next/next/no-img-element -- remote signed/data URLs, not next/image-eligible.
              <img
                key={i}
                src={part.url}
                alt="Əlavə edilmiş şəkil"
                className="mb-2 max-h-56 rounded-lg object-cover"
              />
            );
          }
          if (part.type === 'text') {
            return <TextPart key={i} text={part.text} />;
          }
          return null;
        })}
      </div>

      {!isUser && message.citations && message.citations.length > 0 && (
        <MobileCitations citations={message.citations} />
      )}

      <span className="mono-label px-1 uppercase text-on-surface-variant">
        {isUser ? 'Sən' : 'Yol AI'} · {timestamp}
        {isStreaming ? ' · yazır…' : ''}
      </span>
    </div>
  );
});

// Its OWN drawer, deliberately not the global sidebar one. Opening the sidebar
// here showed the whole app shell — logo, the six nav links, the admin link,
// logout, the install button, "Bizə yazın" — when the only thing asked for was
// the conversation list.
//
// ChatConversationList itself is mounted unmodified: it owns the real
// fetch/create/rename/delete calls against /api/chat?type=history, so this is
// different chrome around the same list, not a second implementation of it.
//
// Split out as its own component so its state and the pathname subscription sit
// outside MobileChat, which re-renders on every streamed token.
function ChatHistoryButton() {
  const pathname = usePathname();
  // Openness is DERIVED, not synced: state holds the route the drawer was
  // opened on, and it counts as open only while that still matches the current
  // route. Picking a conversation navigates to /chat/<id>, the routes stop
  // matching, and the drawer closes on the same render — no effect, so no
  // cascading setState. (ChatConversationList closes the *sidebar* context on
  // navigate; it has no knowledge of this drawer.)
  const [openedOnPath, setOpenedOnPath] = useState<string | null>(null);
  const isOpen = openedOnPath !== null && openedOnPath === pathname;

  const setIsOpen = (open: boolean) => setOpenedOnPath(open ? pathname : null);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Söhbət tarixçəsini aç"
        className="glass-card inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-label-sm font-semibold text-on-surface shadow-sm transition active:scale-95"
      >
        <ClockIcon width={16} height={16} className="text-primary" />
        Tarixçə
      </button>

      <Drawer.Backdrop isOpen={isOpen} onOpenChange={setIsOpen} variant="blur" className="md:hidden">
        <Drawer.Content placement="left" className="md:hidden">
          <Drawer.Dialog className="editorial flex h-full w-80 max-w-[85vw] flex-col gap-0 rounded-r-3xl bg-surface p-0">
            <div className="flex items-center justify-between gap-2 border-b border-outline-variant/40 px-4 py-4">
              <h2 className="text-[16px] font-semibold text-on-surface">Söhbətlər</h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Bağla"
                className="rounded-full p-1.5 text-on-surface-variant transition hover:bg-surface-tertiary"
              >
                <CloseIcon width={18} height={18} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-4">
              <ChatConversationList />
            </div>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </>
  );
}

// Mobile-only visual restyle of the existing useChat-driven chat — all state
// (messages, composer input, coin balance) lives in ChatClient.tsx and is
// passed down as props/callbacks; this component owns no chat state of its
// own (no useChat, no coin fetch) per the structural split documented there.
export default function MobileChat({
  messages,
  timestampFor,
  isBusy,
  isStreamingId,
  historyLoaded,
  input,
  onInputChange,
  onSubmit,
  visionAvailable,
  attachedPreviewUrl,
  onAttachClick,
  onCameraClick,
  onClearAttachedFile,
  onShareAction,
  canNativeShare,
  hasMessages,
  isResizingImage,
  messageInputRef,
  scrollContainerRef,
  bottomSentinelRef,
}: MobileChatProps) {
  return (
    // `editorial` puts this tree on the home page's palette (sand canvas, navy
    // text, deep-blue primary, white solid cards instead of glass) — see the
    // .editorial block in app/globals.css. chat-hud-shell is kept so the 3D
    // design's own chat skin still applies when that design is active.
    <div className="editorial chat-hud-shell flex h-full flex-col">
      {/* No <header> here on purpose: the global NavBar is the single top bar
          on mobile (it carries back, section title, coins, notifications and
          the account menu). This used to render a second stacked one. */}

      {/* pb-64 (256px), not the composer's own ~96px offset + ~60px height:
          the fixed composer's footprint grows by another ~64px when the
          image-attach preview row is showing, and the scroll container can't
          react to that dynamically without measuring it, so this reserves
          enough for the worst case rather than the common one. */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 pb-64">
        {/* Chat history is only reachable through the sidebar drawer, and the
            control that opens it (SidebarToggleButton) is `hidden md:inline-flex`
            in the navbar — so on mobile there was no way in at all. This is that
            way in. It opens the SAME drawer, which already renders
            ChatConversationList (list + new/rename/delete), so there is no second
            history UI to keep in sync.

            Sticky rather than fixed: it rides the top of the scroll container, so
            it stays reachable while scrolling back through a long conversation
            without floating over the composer or the bottom tab bar. */}
        <div className="sticky top-0 z-10 -mx-4 mb-1 flex items-center justify-end gap-2 bg-gradient-to-b from-surface/95 to-transparent px-4 pt-3 pb-4 backdrop-blur-sm">
          <ChatHistoryButton />
          <Dropdown.Root>
            <Dropdown.Trigger
              isDisabled={!hasMessages}
              aria-label="Paylaş"
              className="glass-card inline-flex size-9 items-center justify-center rounded-full text-on-surface shadow-sm outline-none transition active:scale-95 disabled:pointer-events-none disabled:opacity-40"
            >
              <ShareIcon width={16} height={16} className="text-primary" />
            </Dropdown.Trigger>
            <Dropdown.Popover placement="bottom end" className="opaque-popover min-w-[210px] rounded-xl p-1">
              <Dropdown.Menu aria-label="Paylaşım seçimləri" onAction={onShareAction}>
                <Dropdown.Item id="copy-link" textValue="Linki kopyala" className="text-sm text-on-surface">
                  Linki kopyala
                </Dropdown.Item>
                {canNativeShare && (
                  <Dropdown.Item id="native-share" textValue="Paylaş..." className="text-sm text-on-surface">
                    Paylaş...
                  </Dropdown.Item>
                )}
                <Dropdown.Item id="export-text" textValue="Mətn kimi ixrac et" className="text-sm text-on-surface">
                  Mətn kimi ixrac et
                </Dropdown.Item>
                <Dropdown.Item id="export-pdf" textValue="PDF kimi ixrac et" className="text-sm text-on-surface">
                  PDF kimi ixrac et
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown.Root>
        </div>

        {!historyLoaded && (
          <div className="flex flex-col items-start gap-1.5">
            <div className="glass-panel max-w-[85%] rounded-2xl rounded-tl-none border-l-2 border-primary px-4 py-3">
              <span className="inline-block h-3 w-40 animate-pulse rounded-full bg-outline-variant/30" />
            </div>
          </div>
        )}

        {historyLoaded && messages.length === 0 && !isBusy && (
          <div className="glass-card mx-auto max-w-sm rounded-2xl px-5 py-7 text-center">
            <p className="text-body-md text-on-surface-variant">
              Yol hərəkəti qaydaları ilə bağlı sualınızı yazın, cavab təsdiqlənmiş sənədlərə istinadla veriləcək.
            </p>
          </div>
        )}

        <div className="space-y-5">
          {messages.map((message) => (
            <MobileMessageBubble
              key={message.id}
              message={message}
              timestamp={timestampFor(message.id)}
              isStreaming={isBusy && message.id === isStreamingId}
            />
          ))}
        </div>

        {isBusy && (
          <div className="mt-5 flex items-center gap-2 text-on-surface-variant">
            <Spinner size="sm" />
            <span className="mono-label uppercase">Cavab hazırlanır...</span>
          </div>
        )}

        <div ref={bottomSentinelRef} />
      </div>

      <div className="fixed inset-x-0 bottom-24 z-20 px-4">
        {attachedPreviewUrl && (
          <div className="mb-2 flex items-center gap-2">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not next/image-eligible. */}
              <img
                src={attachedPreviewUrl}
                alt="Əlavə ediləcək şəkil"
                className="h-14 w-14 rounded-lg border border-outline-variant/40 object-cover"
              />
              <button
                type="button"
                onClick={onClearAttachedFile}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-surface p-0.5 text-on-surface-variant shadow"
                aria-label="Şəkli sil"
              >
                <CloseIcon width={12} height={12} />
              </button>
            </div>
          </div>
        )}
        {/* Mockup shape: a rounded-full input pill (attach + text + mic) and
            a visually separate circular send button beside it — not one
            continuous pill, see Stitch "AI Söhbət (Premium)" export. */}
        <form onSubmit={onSubmit} className="flex items-center gap-2">
          <div className="chat-composer glass-panel flex flex-1 items-center gap-1 rounded-full px-1.5 py-1.5 shadow-lg">
            {visionAvailable && (
              <Dropdown>
                <Dropdown.Trigger
                  isDisabled={isResizingImage}
                  aria-label="Şəkil əlavə et"
                  className="shrink-0 rounded-full p-2 text-on-surface-variant outline-none transition hover:bg-surface-hover hover:text-on-surface disabled:pointer-events-none disabled:opacity-40"
                >
                  {isResizingImage ? <Spinner size="sm" /> : <PaperclipIcon width={18} height={18} />}
                </Dropdown.Trigger>
                <Dropdown.Popover className="opaque-popover min-w-[200px] rounded-xl p-1">
                  <Dropdown.Menu
                    onAction={(key) => {
                      if (key === 'camera') onCameraClick();
                      else onAttachClick();
                    }}
                  >
                    <Dropdown.Item id="camera" textValue="Şəkil çək">
                      <CameraIcon width={18} height={18} className="shrink-0 text-on-surface-variant" />
                      <Label>Şəkil çək</Label>
                    </Dropdown.Item>
                    <Dropdown.Item id="gallery" textValue="Qalereyadan seç">
                      <ImageIcon width={18} height={18} className="shrink-0 text-on-surface-variant" />
                      <Label>Qalereyadan seç</Label>
                    </Dropdown.Item>
                  </Dropdown.Menu>
                </Dropdown.Popover>
              </Dropdown>
            )}
            <Input
              ref={messageInputRef}
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder="Sualınızı yazın..."
              fullWidth
              className="rounded-full bg-transparent"
            />
            {/* Decorative only — voice input isn't wired (no speech-to-text in
                scope). Disabled + muted so it doesn't read as a working control. */}
            <button
              type="button"
              disabled
              aria-label="Səsli mesaj (tezliklə)"
              title="Tezliklə"
              className="shrink-0 rounded-full p-2 text-on-surface-variant/40"
            >
              <MicIcon width={18} height={18} />
            </button>
          </div>
          <Button
            type="submit"
            variant="primary"
            isDisabled={isBusy}
            isIconOnly
            className="glow-primary size-12 shrink-0 rounded-full"
            aria-label="Göndər"
          >
            <SendIcon width={18} height={18} />
          </Button>
        </form>
      </div>

      <MobileBottomTabBar />
    </div>
  );
}
