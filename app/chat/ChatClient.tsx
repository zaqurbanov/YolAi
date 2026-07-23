'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Badge, Input, Button, Chip, AlertDialog, Modal, Dropdown, Skeleton, toast } from '@heroui/react';
import {
  SendIcon,
  ShareIcon,
  MoreIcon,
  TrashIcon,
  InfoIcon,
  CopyIcon,
  CheckIcon,
  ArrowUpIcon,
  CameraIcon,
  CloseIcon,
} from '@/components/icons';
import { CONVERSATION_CHANGED_EVENT } from '@/lib/chat/conversationEvents';
import { Spinner } from '@/components/Spinner';
import { renderCitationText } from '@/lib/chat/renderCitationText';
import { formatAzTime } from '@/lib/format/date';
import { formatCoinBalance } from '@/lib/format/coins';
import { ADMIN_CONTACT_EMAIL } from '@/lib/contact';

interface Citation {
  document_id: string;
  title: string;
  page: number | null;
  article_label: string | null;
}

interface HistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: Citation[] | null;
  created_at: string;
}

type CoinInfo = { balance: number; price: number };

type ChatMessageMetadata = {
  citations?: Citation[];
  modelUsed?: string;
  messageId?: string;
  coins?: CoinInfo;
  conversationId?: string;
};

type ChatUIMessage = UIMessage<ChatMessageMetadata>;

interface RequestLog {
  rewrite_ms: number | null;
  embed_ms: number | null;
  db_search_ms: number | null;
  llm_first_token_ms: number | null;
  llm_total_ms: number | null;
  used_fallback: boolean | null;
  model_used: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  created_at: string;
}

type LogFetchState = { status: 'loading' } | { status: 'success'; log: RequestLog | null } | { status: 'error' };

function formatMs(ms: number | null): string {
  if (ms == null) return '—';
  return `${Math.round(ms)}ms`;
}

// DefaultChatTransport throws `new Error(rawBodyText)` on non-OK responses, so
// `error.message` is the raw JSON body (see lib/api/errors.ts's apiError shape)
// rather than a clean message. Parse it back out where possible.
function extractApiErrorMessage(err: Error): string | null {
  try {
    const parsed = JSON.parse(err.message);
    return typeof parsed?.error === 'string' ? parsed.error : null;
  } catch {
    return null;
  }
}

// Same parse as extractApiErrorMessage, for the `code` field (e.g.
// 'insufficient_coins') apiError() attaches — lets the UI branch on error
// type instead of only displaying free text.
function extractApiErrorCode(err: Error): string | null {
  try {
    const parsed = JSON.parse(err.message);
    return typeof parsed?.code === 'string' ? parsed.code : null;
  } catch {
    return null;
  }
}

function formatTokens(log: RequestLog): string {
  if (log.total_tokens == null) return '—';
  if (log.prompt_tokens == null || log.completion_tokens == null) return `${log.total_tokens}`;
  return `${log.total_tokens} (giriş: ${log.prompt_tokens}, çıxış: ${log.completion_tokens})`;
}

// Sequential pipeline (app/api/chat/route.ts): rewrite -> embed -> DB search -> LLM.
// llm_first_token_ms is a milestone within llm_total_ms, not an additional
// duration, so it's deliberately excluded here to avoid double-counting.
function sumMs(...values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0);
}

function messageToPlainText(message: ChatUIMessage) {
  return message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
}

// Re-parsing citation/excerpt markup on every render is cheap in absolute
// terms (~4ms across a full streamed response, measured) but still O(n) per
// token delta for no reason once text stops changing — memoize per part text.
function TextPart({ text }: { text: string }) {
  const nodes = useMemo(() => renderCitationText(text), [text]);
  return <span className="whitespace-pre-wrap">{nodes}</span>;
}

interface MessageBubbleProps {
  message: ChatUIMessage;
  timestamp: string;
  isCitationsExpanded: boolean;
  isStreaming: boolean;
  onToggleCitations: (messageId: string) => void;
  onOpenLog: (messageId: string) => void;
}

// Memoized so a streamed chunk to the newest message doesn't force React to
// re-diff every earlier bubble in a long conversation on every token — see
// bug report re: streaming jank. Props are kept to primitives + stable
// callbacks (see ChatPage) so this actually skips re-render for untouched
// messages, not just in theory.
const MessageBubble = memo(function MessageBubble({
  message,
  timestamp,
  isCitationsExpanded,
  isStreaming,
  onToggleCitations,
  onOpenLog,
}: MessageBubbleProps) {
  const metadata = message.metadata as ChatMessageMetadata | undefined;
  const citations = metadata?.citations;
  const modelUsed = metadata?.modelUsed;
  const isUser = message.role === 'user';
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(messageToPlainText(message));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.danger('Kopyalamaq uğursuz oldu');
    }
  }

  return (
    <div className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
      <div className={`flex items-end gap-2 ${isUser ? '' : 'flex-row'}`}>
        {!isUser && (
          <Image
            src="/ai.png"
            alt="Yol AI"
            width={40}
            height={40}
            className="mb-0.5 size-10 shrink-0 rounded-full object-cover"
          />
        )}
        <div
          className={
            isUser
              ? 'glow-primary max-w-[85%] rounded-2xl rounded-tr-none bg-primary px-4 py-3 text-sm text-on-primary'
              : 'glass-panel max-w-[85%] rounded-2xl rounded-tl-none border-l-2 border-primary px-4 py-3 text-sm text-on-surface'
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
                  className="mb-2 max-h-64 rounded-lg object-cover"
                />
              );
            }
            if (part.type === 'text') {
              return <TextPart key={i} text={part.text} />;
            }
            if (part.type === 'reasoning' && part.text) {
              return (
                <div
                  key={i}
                  className="mono-label mb-2 border-l-2 border-outline-variant/60 pl-2 text-on-surface-variant/70 italic"
                >
                  {part.state === 'streaming' ? 'Düşünür...' : 'Düşündü'}
                </div>
              );
            }
            return null;
          })}
        </div>
      </div>

      {!isUser && citations && citations.length > 0 && (
        isCitationsExpanded ? (
          <div className="flex max-w-[85%] flex-col gap-1.5">
            <div className="flex flex-wrap gap-1.5">
              {citations.map((c, i) => (
                <span
                  key={i}
                  className="text-legal-citation rounded-lg border border-regulatory-blue/30 bg-regulatory-blue/15 px-2.5 py-1 text-regulatory-blue"
                >
                  {c.title}
                  {c.article_label ? ` · ${c.article_label}` : ''}
                  {c.page ? ` · s.${c.page}` : ''}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onToggleCitations(message.id)}
              className="mono-label w-fit px-1 text-on-surface-variant/70 hover:text-on-surface hover:underline"
            >
              Gizlət
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onToggleCitations(message.id)}
            className="mono-label w-fit px-1 text-primary hover:underline"
          >
            Sitatları oxu ({citations.length})
          </button>
        )
      )}

      <span className="mono-label inline-flex items-center gap-1 px-1 uppercase text-on-surface-variant">
        {isUser ? 'Sən' : 'Yol AI'} · {timestamp}
        {!isUser && modelUsed && <> · {modelUsed}</>}
        {!isStreaming && (
          <button
            type="button"
            onClick={handleCopy}
            className="ml-0.5 inline-flex items-center rounded-full p-0.5 normal-case text-on-surface-variant/70 transition hover:bg-surface-hover hover:text-on-surface"
            aria-label={copied ? 'Kopyalandı' : 'Mesajı kopyala'}
          >
            {copied ? <CheckIcon width={13} height={13} /> : <CopyIcon width={13} height={13} />}
          </button>
        )}
        {!isUser && metadata?.messageId != null && (
          <button
            type="button"
            onClick={() => onOpenLog(metadata.messageId!)}
            className="ml-0.5 inline-flex items-center rounded-full p-0.5 normal-case text-on-surface-variant/70 transition hover:bg-surface-hover hover:text-on-surface"
            aria-label="Performans məlumatı"
          >
            <InfoIcon width={13} height={13} />
          </button>
        )}
      </span>
    </div>
  );
});

// Elapsed-time + rotating status phrase for the busy indicator: makes a
// 10-30s wait (dominated by hidden reasoning latency) read as "working", not
// "frozen". Split out from ChatPage so the 250ms tick only re-renders this
// small subtree instead of forcing a full re-diff of the message list on
// every tick (measured: 56-98ms main-thread longtasks at exactly this
// cadence during streaming before this was isolated).
function BusyIndicator({
  isBusy,
  status,
  phrasesByStage,
}: {
  isBusy: boolean;
  status: 'submitted' | 'streaming' | string;
  phrasesByStage: BusyPhrasesByStage;
}) {
  const [elapsedMs, setElapsedMs] = useState(0);
  useEffect(() => {
    if (!isBusy) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the timer when the busy state ends, same pattern as the other busy/stream resets in this file.
      setElapsedMs(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => setElapsedMs(Date.now() - start), 250);
    return () => clearInterval(interval);
  }, [isBusy]);

  if (!isBusy) return null;

  const phrase = busyPhraseFor(status, elapsedMs, phrasesByStage);
  // Countdown, not count-up: anticipation ("cavab yaxınlaşır") reads better
  // than a climbing timer. Starts from the measured median full-answer time
  // (~10s after the 0063 retrieval consolidation). If the answer takes
  // longer, the number is hidden and only "az qaldı…" remains — a counter
  // that goes negative or freezes at 0 would signal "stuck", the opposite of
  // the intent.
  const remaining = COUNTDOWN_FROM_SECONDS - Math.floor(elapsedMs / 1000);

  return (
    <div className="mt-6 flex items-center gap-2 text-on-surface-variant">
      <Spinner size="sm" />
      <span className="mono-label uppercase">{phrase}</span>
      <span className="mono-label text-on-surface-variant/60">
        {remaining > 0 ? `${remaining}s` : 'az qaldı…'}
      </span>
    </div>
  );
}

// Median full-answer latency (see chat_request_logs after migration 0063);
// deliberately a touch above it so the countdown usually finishes just as —
// or slightly after — the first tokens stream in.
const COUNTDOWN_FROM_SECONDS = 10;

// Reflects the real backend pipeline (app/api/chat/route.ts) instead of an
// arbitrary rotation, so the wait reads as "here's what's actually
// happening" rather than generic filler. Thresholds are elapsed-time
// *estimates* (the client has no real-time stage signal — messageMetadata
// only arrives at the end), calibrated against measured chat_request_timing
// medians: query rewrite (~a few seconds), then DB vector/trigram search
// (the largest chunk, often 10s+), then the model call itself. `status`
// still overrides once streaming genuinely starts, since at that point the
// answer really is being written token by token, regardless of how long the
// earlier stages took.
// Sub-phrases for the DB search stage (rewrite.ts hands off to
// lib/retrieval/search.ts's vector + trigram + per-document + article-number
// calls, all run concurrently) — this stage is consistently the longest part
// of the wait, so a single static sentence sat unchanged for 10s+. Rotating
// through a few genuinely-descriptive sentences here (not the old arbitrary
// BUSY_PHRASES) keeps the wait informative instead of looking stuck.
const DB_SEARCH_PHRASE_INTERVAL_MS = 4000;

type BusyPhraseStage = 'analyzing' | 'rewriting' | 'searching' | 'finalizing' | 'streaming';
type BusyPhrasesByStage = Record<BusyPhraseStage, string[]>;

// Used until the DB-backed fetch (below) resolves, and as a permanent
// fallback if it fails or the admin hasn't seeded any rows yet — same
// strings this indicator always used, just reshaped into the per-stage
// structure admin-managed data now arrives in.
const FALLBACK_BUSY_PHRASES: BusyPhrasesByStage = {
  analyzing: ['Sual analiz edilir...'],
  rewriting: ['Sual daha dəqiq axtarış üçün tərtib olunur...'],
  searching: [
    'Sənəd bazasında axtarış aparılır...',
    'Müvafiq maddələr sənədlərdən axtarılır...',
    'Nəticələr uyğunluğa görə sıralanır...',
  ],
  finalizing: ['Ən uyğun maddələr seçilir...'],
  streaming: ['Cavab yazılır...'],
};

function busyPhraseFor(
  status: 'submitted' | 'streaming' | string,
  elapsedMs: number,
  phrasesByStage: BusyPhrasesByStage,
): string {
  const pick = (stage: BusyPhraseStage, phrases: string[]) =>
    phrases.length > 0 ? phrases : FALLBACK_BUSY_PHRASES[stage];

  if (status === 'streaming') {
    const phrases = pick('streaming', phrasesByStage.streaming);
    return phrases[0];
  }
  if (elapsedMs < 3000) {
    const phrases = pick('analyzing', phrasesByStage.analyzing);
    return phrases[0];
  }
  if (elapsedMs < 8000) {
    const phrases = pick('rewriting', phrasesByStage.rewriting);
    return phrases[0];
  }
  if (elapsedMs < 18000) {
    const phrases = pick('searching', phrasesByStage.searching);
    const i = Math.floor((elapsedMs - 8000) / DB_SEARCH_PHRASE_INTERVAL_MS) % phrases.length;
    return phrases[i];
  }
  const phrases = pick('finalizing', phrasesByStage.finalizing);
  return phrases[0];
}

interface ChatClientProps {
  // null on the id-less /chat landing page (brand new chat, nothing to load
  // yet); set on /chat/[id] (existing conversation). ChatClient is remounted
  // (via a `key={id}` from the page wrappers) whenever the user navigates
  // between two *different* existing conversations, so this only needs to be
  // read once per mount, not re-synced from a changing prop.
  conversationId: string | null;
  // Server-resolved (isVisionAvailable(), no network call) — controls whether
  // the attach-image affordance renders at all. Not re-checked client-side;
  // the backend still enforces this independently (422 vision_unavailable)
  // as a backstop, this prop only decides what the composer offers to show.
  visionAvailable: boolean;
}

export default function ChatClient({ conversationId: initialConversationId, visionAvailable }: ChatClientProps) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedPreviewUrl, setAttachedPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.danger('Yalnız şəkil faylları qəbul olunur');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.danger('Şəkil 5MB-dan böyük ola bilməz');
      return;
    }
    setAttachedFile(file);
  }

  function clearAttachedFile() {
    setAttachedFile(null);
  }

  // Preview URL lifecycle tied to attachedFile so it can't leak: revoked both
  // on change (old URL) and on unmount.
  useEffect(() => {
    if (!attachedFile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing derived state (object URL) from a changing external File, not derivable during render.
      setAttachedPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(attachedFile);
    setAttachedPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachedFile]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingHistory, setIsDeletingHistory] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [adminPrimaryModelId, setAdminPrimaryModelId] = useState<string | null>(null);
  const adminPrimaryModelIdRef = useRef<string | null>(null);
  const [busyPhrasesByStage, setBusyPhrasesByStage] = useState<BusyPhrasesByStage>(FALLBACK_BUSY_PHRASES);
  const [coins, setCoins] = useState<CoinInfo | null>(null);
  const [logModalMessageId, setLogModalMessageId] = useState<string | null>(null);
  const [logFetchState, setLogFetchState] = useState<LogFetchState | null>(null);
  const [expandedCitationIds, setExpandedCitationIds] = useState<Set<string>>(new Set());
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Mutable across the lifetime of this mount (see ChatClientProps comment):
  // starts as whatever the URL had, then gets filled in once the server
  // hands back the id of a conversation created from the id-less landing
  // page. A ref (not just the state below) so the transport's
  // prepareSendMessagesRequest — called outside React's render cycle — always
  // reads the latest value instead of a stale closure.
  const [conversationId, setConversationId] = useState<string | null>(initialConversationId);
  const conversationIdRef = useRef<string | null>(initialConversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Real conversation title (header falls back to the generic product name
  // below when this is null — e.g. a brand-new conversation whose first
  // message hasn't been auto-titled yet). Refetched on CONVERSATION_CHANGED_EVENT
  // (already dispatched elsewhere in this component when an id-less chat gets
  // its id, and again once an exchange settles — the same two moments the
  // server may have just set/changed the title) rather than adding a new
  // event, to avoid two competing "something about this conversation changed"
  // signals.
  const [conversationTitle, setConversationTitle] = useState<string | null>(null);
  useEffect(() => {
    function handleConversationChanged(e: Event) {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id || id !== conversationIdRef.current) return;
      fetch(`/api/chat?type=history&conversationId=${encodeURIComponent(id)}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { title: string | null } | null) => {
          if (data) setConversationTitle(data.title ?? null);
        })
        .catch(() => {});
    }
    window.addEventListener(CONVERSATION_CHANGED_EVENT, handleConversationChanged);
    return () => window.removeEventListener(CONVERSATION_CHANGED_EVENT, handleConversationChanged);
  }, []);

  const toggleCitations = useCallback((messageId: string) => {
    setExpandedCitationIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }, []);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomSentinelRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the composer on entering the chat, but desktop-only — same
  // 'md' breakpoint this app already uses to split mobile/desktop behavior
  // elsewhere (e.g. components/SidebarShell.tsx's md:hidden). On mobile,
  // focusing on mount pops the on-screen keyboard immediately and shoves the
  // whole layout up before the user has done anything, which is exactly the
  // jank most mobile chat UIs (this app's own reference points included)
  // deliberately avoid — so this can't be a plain `autoFocus` attribute,
  // which has no way to condition on viewport size.
  useEffect(() => {
    if (window.matchMedia('(min-width: 768px)').matches) {
      messageInputRef.current?.focus();
    }
  }, []);
  // Stable across the component's lifetime (empty deps) — conversationId is
  // read from the ref at send-time via prepareSendMessagesRequest, not
  // captured in a closure, so this never needs to be recreated when the id
  // changes (see the first-message-from-landing-page flow below).
  // prepareSendMessagesRequest itself only runs at send-time (inside
  // useChat's sendMessages, triggered from an event handler), not during
  // render — the ref read below is safe despite being lexically inside a
  // useMemo callback; the lint rule can't see that distinction statically.
  /* eslint-disable react-hooks/refs */
  const transport = useMemo(
    () =>
      new DefaultChatTransport<ChatUIMessage>({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ id, messages, body }) => ({
          body: { ...body, id, messages, conversationId: conversationIdRef.current },
        }),
      }),
    [],
  );
  /* eslint-enable react-hooks/refs */
  const { messages, sendMessage, setMessages, status, error } = useChat<ChatUIMessage>({
    transport,
    onError: (err) => {
      console.error('Chat error:', err);
      toast.danger(extractApiErrorMessage(err) ?? 'Cavab alınmadı, yenidən cəhd edin.');
    },
  });

  // Learns the server-assigned conversation id from streamed messageMetadata
  // (app/api/chat/route.ts always includes it). Two cases:
  //  - id-less landing page, first message: conversationIdRef.current was
  //    null -> becomes the new id. URL is updated in-place via
  //    history.replaceState (NOT router.push/replace) specifically so this
  //    effect doesn't trigger a route change mid-stream: a real navigation to
  //    a different dynamic segment would remount this component (or at least
  //    re-run the history-fetch effect below), discarding the in-flight
  //    streamed message. replaceState only changes what the address bar
  //    shows; React's tree and this component's state are untouched.
  //  - existing conversation: id already matches, this is a no-op.
  useEffect(() => {
    const last = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant' && (m.metadata as ChatMessageMetadata | undefined)?.conversationId);
    const newId = (last?.metadata as ChatMessageMetadata | undefined)?.conversationId;
    if (!newId || newId === conversationIdRef.current) return;

    const wasIdLess = conversationIdRef.current === null;
    conversationIdRef.current = newId;
    setConversationId(newId);
    if (wasIdLess) {
      window.history.replaceState(null, '', `/chat/${newId}`);
    }
    window.dispatchEvent(new CustomEvent(CONVERSATION_CHANGED_EVENT, { detail: { id: newId } }));
  }, [messages]);

  // Separately, once a full exchange settles (title/updated_at may have just
  // changed server-side on the first message), nudge the sidebar list to
  // refetch — cheap (one GET), and simpler than trying to patch the list
  // in-place from here.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const wasBusy = prevStatusRef.current === 'streaming' || prevStatusRef.current === 'submitted';
    if (wasBusy && status === 'ready' && conversationIdRef.current) {
      window.dispatchEvent(
        new CustomEvent(CONVERSATION_CHANGED_EVENT, { detail: { id: conversationIdRef.current } }),
      );
    }
    prevStatusRef.current = status;
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    async function loadChatModel() {
      try {
        const res = await fetch('/api/admin/chat-meta?type=model');
        if (!res.ok) return;
        const data: { modelId: string } = await res.json();
        if (!cancelled && data.modelId) setAdminPrimaryModelId(data.modelId);
      } catch {
        // Silent: non-admins/errors just never see the badge.
      }
    }
    void loadChatModel();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    adminPrimaryModelIdRef.current = adminPrimaryModelId;
  }, [adminPrimaryModelId]);

  useEffect(() => {
    let cancelled = false;
    async function loadBusyPhrases() {
      try {
        const res = await fetch('/api/admin/chat-meta?type=busy-phrases');
        if (!res.ok) return;
        const data: { phrases: { id: string; stage: BusyPhraseStage; phrase: string; display_order: number }[] } =
          await res.json();
        if (cancelled || !data.phrases || data.phrases.length === 0) return;

        const grouped: BusyPhrasesByStage = { analyzing: [], rewriting: [], searching: [], finalizing: [], streaming: [] };
        for (const p of data.phrases) {
          if (grouped[p.stage]) grouped[p.stage].push(p.phrase);
        }
        // Any stage the admin hasn't seeded yet keeps the hardcoded fallback
        // rather than showing nothing for that band.
        for (const stage of Object.keys(grouped) as BusyPhraseStage[]) {
          if (grouped[stage].length === 0) grouped[stage] = FALLBACK_BUSY_PHRASES[stage];
        }

        if (!cancelled) setBusyPhrasesByStage(grouped);
      } catch {
        // Silent: fetch failure just keeps the hardcoded fallback.
      }
    }
    void loadBusyPhrases();
    return () => {
      cancelled = true;
    };
  }, []);

  // Mount-time coin balance snapshot so the indicator has a value before the
  // user's first send this session; superseded per-message by metadata.coins
  // below (fresher, and avoids a second DB read per chat request).
  useEffect(() => {
    let cancelled = false;
    async function loadCoins() {
      try {
        const res = await fetch('/api/chat?type=quota');
        if (!res.ok) return;
        const data: { exempt: boolean; balance?: number; price?: number } = await res.json();
        if (cancelled || data.exempt) return;
        if (data.balance != null && data.price != null) {
          setCoins({ balance: data.balance, price: data.price });
        }
      } catch {
        // Silent: indicator just stays hidden.
      }
    }
    void loadCoins();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the indicator (and the nav CoinBadge, via a window event — see
  // components/CoinBadge.tsx) in sync with the freshest server-reported
  // balance once a reply finishes streaming — absent coins (admin, or rare
  // fail-open case) leaves the last known value untouched.
  //
  // `messageMetadata` in app/api/chat/route.ts runs on EVERY streamed chunk
  // (see its own comment) and returns a brand-new `coins` object each call —
  // so `messages` changes dozens of times per second while a reply streams.
  // Without the value-equality guard below, this effect used to call
  // setCoins + dispatch a window CustomEvent on every single chunk, and the
  // CustomEvent synchronously triggers CoinBadge.tsx's own setState — a tight
  // render/effect cascade that could trip React's "Maximum update depth
  // exceeded" guard on a real (non-admin, non-exempt) account. Only sync when
  // the balance actually changed value, not merely object reference.
  const lastSyncedBalanceRef = useRef<number | null>(null);
  useEffect(() => {
    const lastCoins = [...messages]
      .reverse()
      .find((m) => m.role === 'assistant' && (m.metadata as ChatMessageMetadata | undefined)?.coins)
      ?.metadata?.coins;
    if (lastCoins && lastCoins.balance !== lastSyncedBalanceRef.current) {
      lastSyncedBalanceRef.current = lastCoins.balance;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from a prop-driven external source (message stream), not derivable during render.
      setCoins(lastCoins);
      window.dispatchEvent(new CustomEvent('coin-balance-update', { detail: { balance: lastCoins.balance } }));
    }
  }, [messages]);

  // Backfills messageId onto already-hydrated historical assistant messages once
  // we learn the session is admin — /api/chat?type=history isn't itself admin-gated
  // (it returns the real row id to everyone), so history hydration can't set
  // messageId unconditionally without leaking the icon to non-admins. This runs
  // regardless of whether admin status resolves before or after history loads.
  useEffect(() => {
    if (adminPrimaryModelId === null) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.role !== 'assistant') return m;
        const meta = m.metadata as ChatMessageMetadata | undefined;
        if (meta?.messageId != null) return m;
        return { ...m, metadata: { ...meta, messageId: m.id } };
      })
    );
  }, [adminPrimaryModelId, setMessages]);

  useEffect(() => {
    // navigator.share is client-only (undefined during SSR); this is a one-time
    // capability probe on mount, not state synced from a changing external source.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  // useChat's UIMessage has no createdAt field; we approximate a display
  // timestamp client-side the moment a message first appears and freeze it,
  // rather than fabricating retrieval/server data. Hydrated history messages
  // are pre-seeded below with their real created_at before this effect runs,
  // so it only ever fills in timestamps for genuinely new messages.
  const [timestamps, setTimestamps] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      if (!initialConversationId) {
        // Id-less landing page: nothing to load, chat starts empty.
        if (!cancelled) setHistoryLoaded(true);
        return;
      }
      try {
        const res = await fetch(`/api/chat?type=history&conversationId=${encodeURIComponent(initialConversationId)}`);
        if (res.status === 404) {
          // Invalid/foreign id — treat as "start a fresh new chat", not a
          // blank/broken state.
          router.replace('/chat');
          return;
        }
        if (!res.ok) return;
        const data: { messages: HistoryMessage[]; title: string | null } = await res.json();
        if (cancelled) return;
        setConversationTitle(data.title ?? null);
        if (!Array.isArray(data.messages) || data.messages.length === 0) return;

        const hydrated: ChatUIMessage[] = data.messages.map((m) => {
          // User-uploaded chat images are never persisted (processed
          // in-memory for the vision call only) — history hydration only
          // ever reconstructs the text content, never an image part.
          const parts: ChatUIMessage['parts'] = [{ type: 'text', text: m.content }];
          return {
            id: m.id,
            role: m.role,
            parts,
            metadata:
              m.role === 'assistant'
                ? {
                    citations: m.citations ?? undefined,
                    messageId: adminPrimaryModelIdRef.current !== null ? m.id : undefined,
                  }
                : undefined,
          };
        });

        setMessages(hydrated);
        setTimestamps((prev) => {
          const next = { ...prev };
          for (const m of data.messages) next[m.id] = new Date(m.created_at).getTime();
          return next;
        });
      } catch {
        // Silent fallback: chat just starts empty, same as before this feature existed.
      } finally {
        if (!cancelled) setHistoryLoaded(true);
      }
    }
    void loadHistory();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const missing = messages.filter((m) => !(m.id in timestamps));
    if (missing.length === 0) return;
    // Deliberate: syncing an external clock value into state, guarded above
    // against re-firing once every current message id has a timestamp.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTimestamps((prev) => {
      const next = { ...prev };
      for (const m of missing) next[m.id] = Date.now();
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);
  const timestampFor = useCallback(
    (id: string) => {
      const t = timestamps[id];
      return t ? formatAzTime(new Date(t)) : '';
    },
    [timestamps]
  );

  // How close to the bottom (px) still counts as "at the bottom" — used both
  // to detect genuine user scroll-away and to know when they've scrolled back.
  const NEAR_BOTTOM_THRESHOLD = 80;

  function isNearBottom() {
    const el = scrollContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_THRESHOLD;
  }

  // Whether the user has deliberately scrolled away from the bottom. Unlike a
  // one-shot isNearBottom() read on every `messages` change, this only flips
  // to true from a *real* scroll event, and only when that event wasn't
  // triggered by our own programmatic scrollIntoView call. This is what fixes
  // the streaming lockout bug: a single large content jump growing scrollHeight
  // out from under an unmoved scrollTop used to permanently read as "user
  // scrolled away" even though the user never touched anything.
  const userScrolledAwayRef = useRef(false);
  const autoScrollingRef = useRef(false);
  // Coalesces bursts of 'instant' scroll requests (one arrives per streamed
  // token — many per second) down to at most one scrollIntoView per animation
  // frame. Without this, every token during streaming forced a synchronous
  // scrollIntoView + layout/paint of the blurred (backdrop-filter) message
  // bubble, which stacked up into a real multi-second main-thread freeze
  // right as streaming began — reported live as "page stops responding to
  // clicks/scroll the moment the reply starts typing".
  const pendingScrollFrameRef = useRef<number | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior) => {
    if (behavior === 'instant') {
      if (pendingScrollFrameRef.current !== null) return;
      pendingScrollFrameRef.current = requestAnimationFrame(() => {
        pendingScrollFrameRef.current = null;
        autoScrollingRef.current = true;
        bottomSentinelRef.current?.scrollIntoView({ block: 'end', behavior: 'instant' });
        autoScrollingRef.current = false;
      });
      return;
    }

    // 'smooth' scrolls are only ever triggered once per settled state (not
    // per streamed chunk — those all go through the 'instant' branch above),
    // so no rAF coalescing is needed here.
    const el = scrollContainerRef.current;
    autoScrollingRef.current = true;
    bottomSentinelRef.current?.scrollIntoView({ block: 'end', behavior });
    if (el && 'onscrollend' in el) {
      const handleScrollEnd = () => {
        autoScrollingRef.current = false;
        el.removeEventListener('scrollend', handleScrollEnd);
      };
      el.addEventListener('scrollend', handleScrollEnd);
    } else {
      // Fallback for browsers without 'scrollend': smooth scrolls take a
      // moment to settle.
      window.setTimeout(() => {
        autoScrollingRef.current = false;
      }, 500);
    }
  }, []);

  // Threshold for showing the floating "scroll to top" button — deliberately
  // independent of NEAR_BOTTOM_THRESHOLD above (that one detects "did the
  // user leave the very bottom", this one detects "have they scrolled down
  // far enough that jumping back to the top is actually useful").
  const SCROLL_TOP_BUTTON_THRESHOLD = 240;

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    function handleScroll() {
      if (autoScrollingRef.current) return;
      userScrolledAwayRef.current = !isNearBottom();
      setShowScrollTop((scrollContainerRef.current?.scrollTop ?? 0) > SCROLL_TOP_BUTTON_THRESHOLD);
    }
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    return () => {
      if (pendingScrollFrameRef.current !== null) cancelAnimationFrame(pendingScrollFrameRef.current);
    };
  }, []);

  // Initial land-at-bottom on page load/refresh, once history hydration settles —
  // instant (no visible scroll-through-history animation).
  useEffect(() => {
    if (!historyLoaded) return;
    scrollToBottom('instant');
  }, [historyLoaded, scrollToBottom]);

  // Auto-follow on new messages and streaming growth — but only while the user
  // hasn't deliberately scrolled away to read earlier messages. Uses 'instant'
  // during active streaming so a fast-growing response doesn't restart a
  // smooth-scroll animation on every chunk; 'smooth' otherwise (e.g. the
  // assistant's reply landing after a non-streamed update).
  useEffect(() => {
    if (!historyLoaded) return;
    if (userScrolledAwayRef.current) return;
    const behavior: ScrollBehavior = status === 'streaming' || status === 'submitted' ? 'instant' : 'smooth';
    scrollToBottom(behavior);
  }, [messages, historyLoaded, status, scrollToBottom]);

  const isBusy = status === 'streaming' || status === 'submitted';

  async function handleConfirmDeleteHistory() {
    if (!conversationId) {
      // Nothing exists server-side yet on the id-less landing page — the
      // trash button is disabled in this state, but guard anyway.
      setIsDeleteDialogOpen(false);
      return;
    }
    setIsDeletingHistory(true);
    try {
      const res = await fetch(`/api/chat?type=history&conversationId=${encodeURIComponent(conversationId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        toast.danger('Söhbəti silmək uğursuz oldu');
        return;
      }
      window.dispatchEvent(new CustomEvent(CONVERSATION_CHANGED_EVENT, { detail: { id: conversationId } }));
      toast.success('Söhbət silindi');
      setIsDeleteDialogOpen(false);
      // The conversation row is gone server-side — leave this page for a
      // fresh id-less chat rather than leaving a dead id in the URL.
      router.push('/chat');
    } catch {
      toast.danger('Söhbəti silmək uğursuz oldu');
    } finally {
      setIsDeletingHistory(false);
    }
  }

  async function fetchAbsoluteShareUrl(): Promise<string | null> {
    if (!conversationId) {
      toast.danger('Paylaşılacaq söhbət yoxdur');
      return null;
    }
    try {
      const res = await fetch(`/api/chat?type=history&action=share&conversationId=${encodeURIComponent(conversationId)}`, {
        method: 'POST',
      });
      if (!res.ok) {
        if (res.status === 404) {
          toast.danger('Paylaşılacaq söhbət yoxdur');
        } else {
          toast.danger('Paylaşmaq uğursuz oldu');
        }
        return null;
      }
      const data: { url: string } = await res.json();
      return `${window.location.origin}${data.url}`;
    } catch {
      toast.danger('Paylaşmaq uğursuz oldu');
      return null;
    }
  }

  async function copyShareLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link kopyalandı');
    } catch {
      toast.danger('Linki kopyalamaq uğursuz oldu');
    }
  }

  async function copyAdminEmail() {
    try {
      await navigator.clipboard.writeText(ADMIN_CONTACT_EMAIL);
      toast.success('E-poçt kopyalandı');
    } catch {
      toast.danger('E-poçtu kopyalamaq uğursuz oldu');
    }
  }

  function handleExportText() {
    const lines = messages.map((message) => {
      const label = message.role === 'user' ? 'Sən:' : 'Yol AI:';
      return `${label} ${messageToPlainText(message)}`;
    });
    const blob = new Blob([lines.join('\n\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yol-sohbet.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleShareAction(key: React.Key) {
    switch (key) {
      case 'copy-link': {
        const url = await fetchAbsoluteShareUrl();
        if (url) await copyShareLink(url);
        break;
      }
      case 'native-share': {
        const url = await fetchAbsoluteShareUrl();
        if (!url) return;
        if (typeof navigator === 'undefined' || !navigator.share) {
          await copyShareLink(url);
          return;
        }
        try {
          await navigator.share({ title: 'Yol Hərəkəti Qaydaları üzrə söhbət', url });
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') return;
          toast.danger('Paylaşmaq uğursuz oldu');
        }
        break;
      }
      case 'export-text':
        handleExportText();
        break;
      case 'export-pdf':
        window.print();
        break;
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() && !attachedFile) return;
    if (attachedFile) {
      // sendMessage's `files` accepts a FileList or FileUIPart[], not a bare
      // File[] — DataTransfer is the standard way to construct a FileList
      // from an in-memory File without going through a real <input> element.
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(attachedFile);
      sendMessage({ text: input, files: dataTransfer.files });
    } else {
      sendMessage({ text: input });
    }
    setInput('');
    setAttachedFile(null);
    // Sending is a deliberate action — always follow it to the bottom, even if
    // the user had scrolled up to read earlier messages first, and re-arm
    // auto-follow for the reply that's about to stream in.
    userScrolledAwayRef.current = false;
    requestAnimationFrame(() => {
      scrollToBottom('smooth');
    });
  }

  // Prefer the actual model that answered (post-fallback) over the proactively
  // fetched primary model id; stays pinned to whichever is most recent.
  // Memoized so this O(n) reverse+find doesn't re-run on every render (e.g.
  // the busy-indicator ticker) — only when the message list actually changes.
  const latestModelUsed = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((m) => m.role === 'assistant' && (m.metadata as ChatMessageMetadata | undefined)?.modelUsed)
        ?.metadata?.modelUsed,
    [messages],
  );
  const displayedModelId = latestModelUsed ?? adminPrimaryModelId;

  useEffect(() => {
    if (!logModalMessageId) return;
    let cancelled = false;
    // Deliberate: reset to a loading state the moment the modal opens for a new
    // message, mirroring the same pattern used for busyElapsedMs above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLogFetchState({ status: 'loading' });
    async function loadLog() {
      try {
        const res = await fetch(`/api/admin/chat-meta?type=log&messageId=${logModalMessageId}`);
        if (!res.ok) {
          if (!cancelled) setLogFetchState({ status: 'error' });
          return;
        }
        const data: { log: RequestLog | null } = await res.json();
        if (!cancelled) setLogFetchState({ status: 'success', log: data.log });
      } catch {
        if (!cancelled) setLogFetchState({ status: 'error' });
      }
    }
    void loadLog();
    return () => {
      cancelled = true;
    };
  }, [logModalMessageId]);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <header className="glass-panel print:hidden flex items-center justify-between gap-4 px-4 py-3 sm:px-8">
        <div className="flex items-center gap-3 min-w-0">
          <Badge.Anchor>
            <Avatar size="md">
              <Avatar.Fallback>YH</Avatar.Fallback>
            </Avatar>
            <Badge color="success" placement="bottom-right" size="sm" />
          </Badge.Anchor>
          <div className="min-w-0">
            <h1 className="truncate font-display text-sm font-semibold text-on-surface">
              {conversationTitle ?? 'Yol Hərəkəti Qaydaları üzrə sual-cavab'}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {adminPrimaryModelId && (
                <Chip size="sm" variant="soft" color="default" className="mono-label">
                  Model: {displayedModelId}
                </Chip>
              )}
              {!adminPrimaryModelId && coins && (
                <Chip size="sm" variant="soft" color={coins.balance <= 0 ? 'danger' : 'default'}>
                  {formatCoinBalance(coins.balance)} coin qalıb
                </Chip>
              )}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-on-surface-variant">
          <Dropdown.Root>
            <Dropdown.Trigger
              isDisabled={messages.length === 0}
              className="rounded-full p-2 transition hover:bg-surface-hover hover:text-on-surface disabled:pointer-events-none disabled:opacity-40"
              aria-label="Paylaş"
            >
              <ShareIcon />
            </Dropdown.Trigger>
            <Dropdown.Popover placement="bottom end" className="glass-panel min-w-[210px] rounded-xl p-1">
              <Dropdown.Menu aria-label="Paylaşım seçimləri" onAction={handleShareAction}>
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
          <button
            type="button"
            className="rounded-full p-2 transition hover:bg-surface-hover hover:text-on-surface"
            aria-label="Daha çox"
          >
            <MoreIcon />
          </button>
          <button
            type="button"
            onClick={() => setIsDeleteDialogOpen(true)}
            disabled={!conversationId}
            className="rounded-full p-2 transition hover:bg-error/20 hover:text-error disabled:pointer-events-none disabled:opacity-40"
            aria-label="Söhbəti sil"
          >
            <TrashIcon />
          </button>
        </div>
      </header>

      <div className="relative flex-1 min-h-0 print:hidden">
        <div ref={scrollContainerRef} className="h-full overflow-y-auto px-4 py-6 sm:px-8">
        {!historyLoaded && (
          <div className="space-y-6">
            <div className="flex flex-col items-start gap-1.5">
              <div className="glass-panel max-w-[85%] space-y-2 rounded-2xl rounded-tl-none border-l-2 border-primary px-4 py-3">
                <Skeleton className="h-3 w-64 rounded-full" />
                <Skeleton className="h-3 w-44 rounded-full" />
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <div className="max-w-[85%] space-y-2 rounded-2xl rounded-tr-none bg-surface-container px-4 py-3">
                <Skeleton className="h-3 w-40 rounded-full" />
              </div>
            </div>
          </div>
        )}

        {historyLoaded && messages.length === 0 && !isBusy && (
          <div className="glass-card mx-auto max-w-md rounded-2xl px-6 py-8 text-center">
            <p className="text-sm text-on-surface-variant">
              Yol hərəkəti qaydaları ilə bağlı sualınızı yazın, cavab təsdiqlənmiş sənədlərə istinadla veriləcək.
            </p>
          </div>
        )}

        <div className="space-y-6">
          {messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              timestamp={timestampFor(message.id)}
              isCitationsExpanded={expandedCitationIds.has(message.id)}
              isStreaming={isBusy && index === messages.length - 1 && message.role === 'assistant'}
              onToggleCitations={toggleCitations}
              onOpenLog={setLogModalMessageId}
            />
          ))}
        </div>

        <BusyIndicator isBusy={isBusy} status={status} phrasesByStage={busyPhrasesByStage} />

        {error && !isBusy && (
          <div className="glass-panel mt-6 max-w-[85%] rounded-2xl rounded-tl-none border-l-2 border-error px-4 py-3 text-sm text-error">
            <p>{extractApiErrorMessage(error) ?? 'Cavab alınmadı, yenidən cəhd edin.'}</p>
            {extractApiErrorCode(error) === 'insufficient_coins' && (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-on-surface-variant">
                <a href={`mailto:${ADMIN_CONTACT_EMAIL}`} className="text-primary hover:underline">
                  {ADMIN_CONTACT_EMAIL}
                </a>
                <Button variant="outline" size="sm" onPress={copyAdminEmail} className="gap-1.5">
                  <CopyIcon width={14} height={14} />
                  Kopyala
                </Button>
              </div>
            )}
          </div>
        )}

        <div ref={bottomSentinelRef} />
        </div>

        {showScrollTop && (
          <button
            type="button"
            onClick={() => scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            className="glass-panel absolute bottom-4 right-4 z-10 rounded-full p-2.5 text-on-surface-variant transition hover:text-on-surface print:hidden"
            aria-label="Yuxarı qalx"
          >
            <ArrowUpIcon width={18} height={18} />
          </button>
        )}
      </div>

      <div className="border-t border-outline-variant/40 px-4 py-4 sm:px-8 print:hidden">
        {attachedPreviewUrl && (
          <div className="mb-2 flex items-center gap-2">
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, not next/image-eligible. */}
              <img
                src={attachedPreviewUrl}
                alt="Əlavə ediləcək şəkil"
                className="h-16 w-16 rounded-lg border border-outline-variant/40 object-cover"
              />
              <button
                type="button"
                onClick={clearAttachedFile}
                className="absolute -right-1.5 -top-1.5 rounded-full bg-surface p-0.5 text-on-surface-variant shadow transition hover:text-on-surface"
                aria-label="Şəkli sil"
              >
                <CloseIcon width={14} height={14} />
              </button>
            </div>
          </div>
        )}
        <form onSubmit={handleSubmit} className="glass-panel flex items-center gap-2 rounded-2xl p-2">
          {visionAvailable && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 rounded-full p-2 text-on-surface-variant transition hover:bg-surface-hover hover:text-on-surface"
                aria-label="Şəkil əlavə et"
              >
                <CameraIcon width={20} height={20} />
              </button>
            </>
          )}
          <Input
            ref={messageInputRef}
            data-tour="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Sualınızı yazın..."
            fullWidth
            className="bg-transparent"
          />
          <Button
            type="submit"
            variant="primary"
            isDisabled={isBusy}
            isIconOnly
            className="glow-primary shrink-0 focus-visible:ring-2 focus-visible:ring-primary/50"
            aria-label="Göndər"
          >
            {/* Spins 180° to face downward on submit (isBusy true, tied to the
                same status the button's own isDisabled uses) and springs back
                to its resting upward-facing position the moment isBusy clears
                — a "sent" micro-interaction rather than a static disabled look. */}
            <span
              className={`inline-flex transition-transform duration-300 ease-out ${isBusy ? 'rotate-180' : 'rotate-0'}`}
            >
              <SendIcon />
            </span>
          </Button>
        </form>
        <p className="mt-2 text-center text-xs text-on-surface-variant">
          AI həmişə doğru cavab vermir, zəhmət olmasa cavabların doğru olduğundan əmin olun.
        </p>
      </div>

      <div className="hidden print:block print:p-8 print:text-black">
        <h1 className="mb-6 text-xl font-semibold">Yol Hərəkəti Qaydaları üzrə sual-cavab</h1>
        <div className="space-y-4">
          {messages.map((message) => {
            const citations = (message.metadata as { citations?: Citation[] } | undefined)?.citations;
            const isUser = message.role === 'user';
            return (
              <div key={message.id} className="break-inside-avoid">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide">
                  {isUser ? 'Sən' : 'Yol AI'} · {timestampFor(message.id)}
                </p>
                <p className="whitespace-pre-wrap text-sm">{messageToPlainText(message)}</p>
                {!isUser && citations && citations.length > 0 && (
                  <p className="mt-1 text-xs text-gray-600">
                    {citations
                      .map(
                        (c) =>
                          `${c.title}${c.article_label ? ` · ${c.article_label}` : ''}${c.page ? ` · s.${c.page}` : ''}`
                      )
                      .join(' | ')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <AlertDialog.Backdrop
        isOpen={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) setIsDeleteDialogOpen(false);
        }}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Icon status="danger" />
            <AlertDialog.Header>
              <AlertDialog.Heading>Söhbəti sil</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              Bu söhbət həmişəlik silinəcək. Bu əməliyyatı geri qaytarmaq mümkün deyil.
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button
                variant="outline"
                onPress={() => setIsDeleteDialogOpen(false)}
                isDisabled={isDeletingHistory}
              >
                Ləğv et
              </Button>
              <Button variant="danger" onPress={handleConfirmDeleteHistory} isPending={isDeletingHistory}>
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner size="sm" tone="current" /> : null}
                    Sil
                  </>
                )}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>

      <Modal.Backdrop
        isOpen={logModalMessageId != null}
        onOpenChange={(open) => {
          if (!open) {
            setLogModalMessageId(null);
            setLogFetchState(null);
          }
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[420px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Performans məlumatı</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              {logFetchState?.status === 'loading' && (
                <div className="space-y-2">
                  <Skeleton className="h-3 w-full rounded-full" />
                  <Skeleton className="h-3 w-4/5 rounded-full" />
                  <Skeleton className="h-3 w-3/5 rounded-full" />
                </div>
              )}
              {logFetchState?.status === 'error' && (
                <p className="text-sm text-error">Performans məlumatını yükləmək uğursuz oldu.</p>
              )}
              {logFetchState?.status === 'success' && logFetchState.log === null && (
                <p className="text-sm text-on-surface-variant">
                  Bu mesaj üçün performans məlumatı tapılmadı.
                </p>
              )}
              {logFetchState?.status === 'success' && logFetchState.log && (
                <dl className="mono-label space-y-1.5 text-on-surface">
                  <div className="flex items-center justify-between gap-4 border-b border-outline-variant/40 pb-1.5 text-sm font-semibold">
                    <dt>Ümumi vaxt</dt>
                    <dd>
                      {formatMs(
                        sumMs(
                          logFetchState.log.rewrite_ms,
                          logFetchState.log.embed_ms,
                          logFetchState.log.db_search_ms,
                          logFetchState.log.llm_total_ms
                        )
                      )}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-on-surface-variant">Sual yenidən yazıldı</dt>
                    <dd>{formatMs(logFetchState.log.rewrite_ms)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-on-surface-variant">Embedding</dt>
                    <dd>{formatMs(logFetchState.log.embed_ms)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-on-surface-variant">DB axtarışı</dt>
                    <dd>{formatMs(logFetchState.log.db_search_ms)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-on-surface-variant">Cavabın ilk hərfi</dt>
                    <dd>{formatMs(logFetchState.log.llm_first_token_ms)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-on-surface-variant">Ümumi model vaxtı</dt>
                    <dd>{formatMs(logFetchState.log.llm_total_ms)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-on-surface-variant">İstifadə olunan model</dt>
                    <dd className="truncate normal-case">{logFetchState.log.model_used ?? '—'}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-on-surface-variant">İstifadə olunan tokenlər</dt>
                    <dd>{formatTokens(logFetchState.log)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-on-surface-variant">Fallback işlədildimi?</dt>
                    <dd>{logFetchState.log.used_fallback ? 'Bəli' : 'Xeyr'}</dd>
                  </div>
                </dl>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button className="w-full" slot="close" variant="secondary">
                Bağla
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </div>
  );
}
