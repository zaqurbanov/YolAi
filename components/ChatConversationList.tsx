'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
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

// Distance the row must travel before releasing counts as "delete". Below it
// the row springs back and nothing happens.
const SWIPE_DELETE_THRESHOLD = 88;
// Slack before the gesture commits to being horizontal. Under this, the touch
// is still assumed to be a vertical scroll of the list.
const SWIPE_DIRECTION_LOCK = 12;

// Module scope, deliberately not state or localStorage: the hint should stop
// after the user has swiped once, but a fresh page load can show it again
// (cheap re-teaching, and it avoids an SSR/hydration mismatch that reading
// localStorage during render would cause).
let swipeHintSeen = false;

/**
 * Swipe left OR right on a conversation row to reveal a red delete affordance;
 * release past the threshold to trigger `onSwipeDelete`.
 *
 * The drag is written straight to `style.transform` through a ref rather than
 * through state — a setState per touchmove would re-render the whole list on
 * every frame of every swipe.
 *
 * Two interactions this has to avoid breaking:
 *  - Vertical scrolling of the list. `touch-action: pan-y` lets the browser
 *    keep ownership of vertical panning, and the direction lock below ignores
 *    any gesture that is more vertical than horizontal.
 *  - Pull-to-refresh (components/PullToRefresh.tsx), which arms on a DOWNWARD
 *    drag at scrollTop 0. This never calls preventDefault on a vertical move,
 *    so a downward drag still reaches it untouched.
 */
function SwipeToDeleteRow({
  children,
  onSwipeDelete,
  disabled,
  showHint,
}: {
  children: ReactNode;
  onSwipeDelete: () => void;
  disabled?: boolean;
  /** Plays the one-time nudge that reveals the delete panel. */
  showHint?: boolean;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const axisRef = useRef<'undecided' | 'horizontal' | 'vertical'>('undecided');
  const deltaRef = useRef(0);
  // Tracks the armed/disarmed edge so the haptic tick and the icon pop fire
  // once per crossing rather than on every frame past the line.
  const armedRef = useRef(false);

  function setOffset(dx: number, animate: boolean) {
    const el = rowRef.current;
    if (!el) return;
    // The hint animation also drives transform; clearing it here hands control
    // back to the finger the moment a real drag starts, instead of the two
    // fighting over the same property.
    el.style.animation = 'none';
    el.style.transition = animate ? 'transform 180ms ease-out' : 'none';
    el.style.transform = `translateX(${dx}px)`;

    // The panel behind intensifies with distance and goes fully solid once the
    // swipe is far enough to count — so the commit point is *felt*, not
    // guessed. Written directly rather than through state for the same
    // per-frame reason as the transform.
    const backdrop = backdropRef.current;
    if (backdrop) {
      const progress = Math.min(1, Math.abs(dx) / SWIPE_DELETE_THRESHOLD);
      backdrop.style.opacity = String(0.25 + progress * 0.75);
      backdrop.style.transition = animate ? 'opacity 180ms ease-out' : 'none';
    }

    // The moment the swipe passes the point of no return, the row snaps to a
    // clearly "armed" state and the phone ticks. A short vibration is the one
    // signal a finger can register without looking at the screen — which is
    // exactly the situation a swipe gesture puts the user in.
    const armed = Math.abs(dx) >= SWIPE_DELETE_THRESHOLD;
    if (armed !== armedRef.current) {
      armedRef.current = armed;
      const backdropEl = backdropRef.current;
      if (backdropEl) backdropEl.dataset.armed = armed ? '1' : '0';
      if (armed && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        // Feature-detected: Android supports it, iOS Safari does not, and
        // browsers ignore it entirely without a prior user gesture. Failing
        // silently is correct — the visual cues carry the message on their own.
        try {
          navigator.vibrate(18);
        } catch {
          // Some engines throw instead of no-oping when the API is blocked.
        }
      }
    }
  }

  function onTouchStart(e: React.TouchEvent) {
    if (disabled || e.touches.length !== 1) return;
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    axisRef.current = 'undecided';
    deltaRef.current = 0;
  }

  function onTouchMove(e: React.TouchEvent) {
    const start = startRef.current;
    if (!start || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - start.x;
    const dy = e.touches[0].clientY - start.y;

    if (axisRef.current === 'undecided') {
      if (Math.abs(dx) < SWIPE_DIRECTION_LOCK && Math.abs(dy) < SWIPE_DIRECTION_LOCK) return;
      axisRef.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    if (axisRef.current !== 'horizontal') return;

    // Resistance past the threshold so the row can't be flung off-screen and
    // the commit point is felt rather than guessed.
    const capped =
      Math.abs(dx) <= SWIPE_DELETE_THRESHOLD
        ? dx
        : Math.sign(dx) * (SWIPE_DELETE_THRESHOLD + (Math.abs(dx) - SWIPE_DELETE_THRESHOLD) * 0.35);
    deltaRef.current = capped;
    setOffset(capped, false);
  }

  function onTouchEnd() {
    const committed = Math.abs(deltaRef.current) >= SWIPE_DELETE_THRESHOLD;
    // Any real swipe means the gesture has been discovered — stop nudging for
    // the rest of the session. Module scope, so it survives the drawer being
    // closed and reopened but resets on reload.
    swipeHintSeen = true;
    startRef.current = null;
    axisRef.current = 'undecided';
    deltaRef.current = 0;
    armedRef.current = false;
    if (backdropRef.current) backdropRef.current.dataset.armed = '0';
    setOffset(0, true);
    if (committed) onSwipeDelete();
  }

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Sits behind the row; only ever seen through the gap the drag opens.
          Mirrored on both edges since either direction deletes. */}
      <div
        ref={backdropRef}
        aria-hidden
        data-armed="0"
        style={{ opacity: 0.25 }}
        className="swipe-delete-backdrop pointer-events-none absolute inset-0 flex items-center justify-between rounded-lg bg-error px-3.5 text-white"
      >
        <span className="flex items-center gap-1.5">
          <TrashIcon width={15} height={15} />
          <span className="text-[11px] font-bold uppercase tracking-wide">Buraxın, silinsin</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold uppercase tracking-wide">Buraxın, silinsin</span>
          <TrashIcon width={15} height={15} />
        </span>
      </div>
      <div
        ref={rowRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className={`relative touch-pan-y bg-surface ${showHint ? 'swipe-hint' : ''}`}
      >
        {children}
      </div>
    </div>
  );
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

      {/* States the gesture in words as well as showing it. The nudge teaches
          it once; this stays. */}
      {conversations !== null && conversations.length > 0 && (
        <p className="mono-label flex items-center gap-1 px-1 pb-1.5 text-muted md:hidden">
          <TrashIcon width={11} height={11} />
          Silmək üçün sürüşdür
        </p>
      )}

      <div className="hud-scrollbar flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {conversations === null && <p className="mono-label px-2 py-1 text-muted">Yüklənir...</p>}
        {conversations !== null && conversations.length === 0 && (
          <p className="mono-label px-2 py-1 text-muted">Söhbət yoxdur</p>
        )}
        {conversations?.map((conv, index) => {
          const isActive = conv.id === activeId;
          const isRenaming = renamingId === conv.id;
          return (
            <SwipeToDeleteRow
              key={conv.id}
              // Swiping opens the SAME confirm dialog the trash button opens,
              // rather than deleting outright — a gesture is far easier to fire
              // by accident than a button press, and deletion is irreversible
              // (the DELETE removes the conversation and its messages).
              onSwipeDelete={() => setPendingDeleteId(conv.id)}
              // A swipe would fight text selection and the caret while the
              // inline rename field is focused.
              disabled={isRenaming}
              // Only the first row, and only until the gesture has been used.
              showHint={index === 0 && !swipeHintSeen}
            >
            <div
              className={`group flex items-center gap-1 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'border-primary/30 bg-accent-soft text-accent-soft-foreground'
                  : 'border-transparent text-muted hover:bg-surface-hover hover:text-foreground'
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
            </SwipeToDeleteRow>
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
