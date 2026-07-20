'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AlertDialog, Button, Input, TextField, toast } from '@heroui/react';
import { PlusIcon, PencilIcon, TrashIcon } from '@/components/icons';
import { Spinner } from '@/components/Spinner';
import { useSidebar } from '@/components/SidebarContext';
import { CONVERSATION_CHANGED_EVENT } from '@/lib/chat/conversationEvents';

interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

const UNTITLED_LABEL = 'Adsız söhbət';

// Module-scope (no closure over component state) so effects below can call
// it directly without tripping the "don't call a state-setting callback
// synchronously in an effect" lint — each call site awaits this and applies
// the result to state itself, same shape as the fetch-then-setState effects
// in app/chat/ChatClient.tsx.
async function fetchConversationList(): Promise<Conversation[] | null> {
  try {
    const res = await fetch('/api/chat?type=history');
    if (!res.ok) return null;
    const data: { conversations: Conversation[] } = await res.json();
    return Array.isArray(data.conversations) ? data.conversations : [];
  } catch {
    return null;
  }
}

// Sidebar-embedded conversation list — a separate client component (not
// folded into the server-component Sidebar.tsx) since it owns real client
// state (fetch, rename/delete mutations). Kept in components/ alongside
// Sidebar.tsx/SidebarNav.tsx rather than app/chat/ because it's rendered
// from the sidebar shell, not the chat route tree.
export function ChatConversationList() {
  const router = useRouter();
  const pathname = usePathname();
  const { isMobile, close } = useSidebar();

  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isSavingRename, setIsSavingRename] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const list = await fetchConversationList();
      if (!cancelled && list !== null) setConversations(list);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onChanged() {
      async function load() {
        const list = await fetchConversationList();
        if (list !== null) setConversations(list);
      }
      void load();
    }
    window.addEventListener(CONVERSATION_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CONVERSATION_CHANGED_EVENT, onChanged);
  }, []);

  // Active id comes from the real route match. This intentionally does NOT
  // reflect ChatClient's in-place history.replaceState update for the
  // id-less-chat-gets-its-first-id case (that bypasses next/navigation on
  // purpose — see ChatClient) — the CONVERSATION_CHANGED_EVENT refetch above
  // is what keeps the list itself current in that moment; the active-row
  // highlight catches up on the next real navigation.
  const activeId = pathname?.startsWith('/chat/') ? pathname.slice('/chat/'.length).split('/')[0] : null;

  function navigate(id: string) {
    if (isMobile) close();
    router.push(`/chat/${id}`);
  }

  async function handleCreate() {
    setIsCreating(true);
    try {
      const res = await fetch('/api/chat?type=history', { method: 'POST' });
      if (!res.ok) {
        toast.danger('Yeni söhbət yaratmaq uğursuz oldu');
        return;
      }
      const data: { id: string } = await res.json();
      navigate(data.id);
      const list = await fetchConversationList();
      if (list !== null) setConversations(list);
    } catch {
      toast.danger('Yeni söhbət yaratmaq uğursuz oldu');
    } finally {
      setIsCreating(false);
    }
  }

  function startRename(conv: Conversation) {
    setRenamingId(conv.id);
    setRenameValue(conv.title ?? '');
  }

  async function saveRename(id: string) {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    setIsSavingRename(true);
    try {
      const res = await fetch('/api/chat?type=history', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId: id, title: trimmed }),
      });
      if (!res.ok) {
        toast.danger('Adı dəyişmək uğursuz oldu');
        return;
      }
      const data: { title: string } = await res.json();
      setConversations((prev) => (prev ? prev.map((c) => (c.id === id ? { ...c, title: data.title } : c)) : prev));
    } catch {
      toast.danger('Adı dəyişmək uğursuz oldu');
    } finally {
      setIsSavingRename(false);
      setRenamingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/chat?type=history&conversationId=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) {
        toast.danger('Söhbəti silmək uğursuz oldu');
        return;
      }
      setConversations((prev) => (prev ? prev.filter((c) => c.id !== id) : prev));
      setPendingDeleteId(null);
      if (activeId === id) router.push('/chat');
    } catch {
      toast.danger('Söhbəti silmək uğursuz oldu');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col px-3">
      <span className="mono-label px-1 pb-1.5 uppercase text-muted">Söhbətlər</span>

      <button
        type="button"
        onClick={handleCreate}
        disabled={isCreating}
        className="mb-2 flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted transition hover:border-accent hover:text-foreground disabled:opacity-60"
      >
        {isCreating ? <Spinner size="sm" /> : <PlusIcon className="shrink-0" width={16} height={16} />}
        Yeni söhbət
      </button>

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {conversations === null && <p className="mono-label px-2 py-1 text-muted">Yüklənir...</p>}
        {conversations !== null && conversations.length === 0 && (
          <p className="mono-label px-2 py-1 text-muted">Söhbət yoxdur</p>
        )}
        {conversations?.map((conv) => {
          const isActive = conv.id === activeId;
          const isRenaming = renamingId === conv.id;
          return (
            <div
              key={conv.id}
              className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm ${
                isActive
                  ? 'bg-accent-soft text-accent-soft-foreground'
                  : 'text-muted hover:bg-surface-hover hover:text-foreground'
              }`}
            >
              {isRenaming ? (
                <TextField
                  aria-label="Söhbətin adı"
                  value={renameValue}
                  onChange={setRenameValue}
                  isDisabled={isSavingRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void saveRename(conv.id);
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setRenamingId(null);
                    }
                  }}
                  className="min-w-0 flex-1"
                >
                  <Input autoFocus onBlur={() => void saveRename(conv.id)} className="text-sm" />
                </TextField>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(conv.id)}
                  className="min-w-0 flex-1 truncate text-left"
                  title={conv.title ?? UNTITLED_LABEL}
                >
                  {conv.title ?? UNTITLED_LABEL}
                </button>
              )}
              {!isRenaming && (
                <div className="hidden shrink-0 items-center gap-0.5 group-hover:flex">
                  <button
                    type="button"
                    onClick={() => startRename(conv)}
                    aria-label="Adı dəyiş"
                    className="rounded-full p-1 transition hover:bg-surface-hover hover:text-foreground"
                  >
                    <PencilIcon width={14} height={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(conv.id)}
                    aria-label="Sil"
                    className="rounded-full p-1 transition hover:bg-error/20 hover:text-error"
                  >
                    <TrashIcon width={14} height={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog.Backdrop
        isOpen={pendingDeleteId != null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
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
              <Button variant="outline" onPress={() => setPendingDeleteId(null)} isDisabled={isDeleting}>
                Ləğv et
              </Button>
              <Button variant="danger" onPress={handleConfirmDelete} isPending={isDeleting}>
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
    </div>
  );
}
