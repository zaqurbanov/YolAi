'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { useCallback, useEffect, useState } from 'react';
import { Avatar, Badge, Input, Button, Chip, Select, ListBox, AlertDialog, Dropdown, Skeleton, toast } from '@heroui/react';
import { SendIcon, ShareIcon, MoreIcon, TrashIcon } from '@/components/icons';
import { Spinner } from '@/components/Spinner';

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

type ChatUIMessage = UIMessage<{ citations?: Citation[]; modelUsed?: string }>;

interface DocumentOption {
  id: string;
  title: string;
}

const ALL_DOCUMENTS_KEY = 'all';

const timeFormatter = new Intl.DateTimeFormat('az-AZ', { hour: '2-digit', minute: '2-digit' });

// Rotates through short status phrases so a long wait doesn't look identical/dead
// at second 2 and second 20 — paired with an elapsed-time counter below.
const BUSY_PHRASES = [
  'Cavab hazırlanır...',
  'Sənədlər araşdırılır...',
  'Müvafiq maddələr axtarılır...',
  'Cavab tərtib olunur...',
];

export default function ChatPage() {
  const [input, setInput] = useState('');
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [selectedDocumentKey, setSelectedDocumentKey] = useState<string>(ALL_DOCUMENTS_KEY);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingHistory, setIsDeletingHistory] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const [adminPrimaryModelId, setAdminPrimaryModelId] = useState<string | null>(null);
  const { messages, sendMessage, setMessages, status, error } = useChat<ChatUIMessage>({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onError: (err) => {
      console.error('Chat error:', err);
      toast.danger('Cavab alınmadı, yenidən cəhd edin.');
    },
  });

  useEffect(() => {
    let cancelled = false;
    async function loadDocuments() {
      try {
        const res = await fetch('/api/documents');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && Array.isArray(data.documents)) {
          setDocuments(data.documents);
        }
      } catch {
        // Silent fallback: selector stays hidden/disabled, global search still works.
      } finally {
        if (!cancelled) setDocumentsLoading(false);
      }
    }
    void loadDocuments();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadChatModel() {
      try {
        const res = await fetch('/api/admin/chat-model');
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
      try {
        const res = await fetch('/api/chat/history');
        if (!res.ok) return;
        const data: { messages: HistoryMessage[] } = await res.json();
        if (cancelled || !Array.isArray(data.messages) || data.messages.length === 0) return;

        const hydrated: ChatUIMessage[] = data.messages.map((m) => ({
          id: m.id,
          role: m.role,
          parts: [{ type: 'text', text: m.content }],
          metadata: m.role === 'assistant' ? { citations: m.citations ?? undefined } : undefined,
        }));

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
  function timestampFor(id: string) {
    const t = timestamps[id];
    return t ? timeFormatter.format(t) : '';
  }

  const isBusy = status === 'streaming' || status === 'submitted';

  // Elapsed-time + rotating status phrase for the busy indicator: makes a
  // 10-30s wait (dominated by hidden reasoning latency) read as "working",
  // not "frozen". Ticks only while isBusy.
  const [busyElapsedMs, setBusyElapsedMs] = useState(0);
  useEffect(() => {
    if (!isBusy) {
      setBusyElapsedMs(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => setBusyElapsedMs(Date.now() - start), 250);
    return () => clearInterval(interval);
  }, [isBusy]);
  const busyPhrase = BUSY_PHRASES[Math.floor(busyElapsedMs / 4000) % BUSY_PHRASES.length];
  const busySeconds = Math.floor(busyElapsedMs / 1000);

  async function handleConfirmDeleteHistory() {
    setIsDeletingHistory(true);
    try {
      const res = await fetch('/api/chat/history', { method: 'DELETE' });
      if (!res.ok) {
        toast.danger('Tarixçəni silmək uğursuz oldu');
        return;
      }
      setMessages([]);
      setTimestamps({});
      toast.success('Tarixçə silindi');
      setIsDeleteDialogOpen(false);
    } catch {
      toast.danger('Tarixçəni silmək uğursuz oldu');
    } finally {
      setIsDeletingHistory(false);
    }
  }

  async function fetchAbsoluteShareUrl(): Promise<string | null> {
    try {
      const res = await fetch('/api/chat/share', { method: 'POST' });
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

  function messageToPlainText(message: ChatUIMessage) {
    return message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('');
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
    if (!input.trim()) return;
    const documentId = selectedDocumentKey === ALL_DOCUMENTS_KEY ? undefined : selectedDocumentKey;
    sendMessage({ text: input }, { body: { documentId } });
    setInput('');
  }

  const handleDocumentSelectionChange = useCallback((key: React.Key | null) => {
    setSelectedDocumentKey(key ? String(key) : ALL_DOCUMENTS_KEY);
  }, []);

  // Prefer the actual model that answered (post-fallback) over the proactively
  // fetched primary model id; stays pinned to whichever is most recent.
  const latestModelUsed = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && (m.metadata as { modelUsed?: string } | undefined)?.modelUsed)
    ?.metadata?.modelUsed;
  const displayedModelId = latestModelUsed ?? adminPrimaryModelId;

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
            <h1 className="truncate font-display text-lg font-semibold text-on-surface">
              Yol Hərəkəti Qaydaları üzrə sual-cavab
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Chip size="sm" variant="soft" color="accent">
                Yol Hərəkəti Eksperti
              </Chip>
              {adminPrimaryModelId && (
                <Chip size="sm" variant="soft" color="default" className="mono-label">
                  Model: {displayedModelId}
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
            className="rounded-full p-2 transition hover:bg-error/20 hover:text-error"
            aria-label="Tarixçəni sil"
          >
            <TrashIcon />
          </button>
        </div>
      </header>

      {documentsLoading && (
        <div className="glass-panel print:hidden flex items-center gap-2 px-4 py-2 sm:px-8">
          <span className="mono-label shrink-0 uppercase text-on-surface-variant">Sənəd</span>
          <Skeleton className="h-8 w-[200px] rounded-full" />
        </div>
      )}

      {!documentsLoading && documents.length > 0 && (
        <div className="glass-panel print:hidden flex items-center gap-2 px-4 py-2 sm:px-8">
          <span className="mono-label shrink-0 uppercase text-on-surface-variant">Sənəd</span>
          <Select
            aria-label="Sənəd seçimi"
            selectedKey={selectedDocumentKey}
            onSelectionChange={handleDocumentSelectionChange}
          >
            <Select.Trigger className="glass-card min-w-[200px] rounded-full px-3 py-1.5 text-sm text-on-surface focus-visible:ring-2 focus-visible:ring-primary/50">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover className="glass-panel rounded-xl p-1">
              <ListBox aria-label="Sənəd seçimi">
                <ListBox.Item id={ALL_DOCUMENTS_KEY} textValue="Bütün sənədlər" className="rounded-lg px-3 py-1.5 text-sm">
                  Bütün sənədlər
                </ListBox.Item>
                {documents.map((doc) => (
                  <ListBox.Item key={doc.id} id={doc.id} textValue={doc.title} className="rounded-lg px-3 py-1.5 text-sm">
                    {doc.title}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6 sm:px-8 print:hidden">
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
          {messages.map((message) => {
            const metadata = message.metadata as { citations?: Citation[]; modelUsed?: string } | undefined;
            const citations = metadata?.citations;
            const modelUsed = metadata?.modelUsed;
            const isUser = message.role === 'user';
            return (
              <div key={message.id} className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
                <div
                  className={
                    isUser
                      ? 'glow-primary max-w-[85%] rounded-2xl rounded-tr-none bg-primary px-4 py-3 text-sm text-on-primary'
                      : 'glass-panel max-w-[85%] rounded-2xl rounded-tl-none border-l-2 border-primary px-4 py-3 text-sm text-on-surface'
                  }
                >
                  {message.parts.map((part, i) => {
                    if (part.type === 'text') {
                      return (
                        <span key={i} className="whitespace-pre-wrap">
                          {part.text}
                        </span>
                      );
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

                {!isUser && citations && citations.length > 0 && (
                  <div className="flex max-w-[85%] flex-wrap gap-1.5">
                    {citations.map((c, i) => (
                      <Chip key={i} size="sm" variant="soft" color="accent" className="mono-label">
                        {c.title}
                        {c.article_label ? ` · ${c.article_label}` : ''}
                        {c.page ? ` · s.${c.page}` : ''}
                      </Chip>
                    ))}
                  </div>
                )}

                <span className="mono-label px-1 uppercase text-on-surface-variant">
                  {isUser ? 'Sən' : 'Yol AI'} · {timestampFor(message.id)}
                  {!isUser && modelUsed && <> · {modelUsed}</>}
                </span>
              </div>
            );
          })}
        </div>

        {isBusy && (
          <div className="mt-6 flex items-center gap-2 text-on-surface-variant">
            <Spinner size="sm" />
            <span className="mono-label uppercase">{busyPhrase}</span>
            {busySeconds > 0 && <span className="mono-label text-on-surface-variant/60">{busySeconds}s</span>}
          </div>
        )}

        {error && !isBusy && (
          <div className="glass-panel mt-6 max-w-[85%] rounded-2xl rounded-tl-none border-l-2 border-error px-4 py-3 text-sm text-error">
            <p>Cavab alınmadı, yenidən cəhd edin.</p>
            {error.message && (
              <p className="mono-label mt-1 text-on-surface-variant">{error.message}</p>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-outline-variant/40 px-4 py-4 sm:px-8 print:hidden">
        <form onSubmit={handleSubmit} className="glass-panel flex items-center gap-2 rounded-2xl p-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Sürət həddi nə qədərdir?"
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
            <SendIcon />
          </Button>
        </form>
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

      <AlertDialog.Root
        isOpen={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!open) setIsDeleteDialogOpen(false);
        }}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Header>
                <AlertDialog.Heading>Tarixçəni sil</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                Bütün söhbət tarixçəniz həmişəlik silinəcək. Bu əməliyyatı geri qaytarmaq mümkün deyil.
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
      </AlertDialog.Root>
    </div>
  );
}
