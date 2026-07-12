'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTableOptions } from 'react-aria-components';
import type { Key, Selection } from 'react-aria-components';
import {
  Card,
  TextField,
  Label,
  Input,
  Button,
  Alert,
  Chip,
  toast,
  Table,
  Checkbox,
  AlertDialog,
  EmptyState,
  Skeleton,
} from '@heroui/react';
import { Spinner } from '@/components/Spinner';

interface DocumentRow {
  id: string;
  title: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  page_count: number | null;
  error_message: string | null;
  created_at: string;
}

const STATUS_COLOR: Record<DocumentRow['status'], 'default' | 'success' | 'danger' | 'warning'> = {
  pending: 'default',
  processing: 'warning',
  ready: 'success',
  failed: 'danger',
};

const dateFormatter = new Intl.DateTimeFormat('az-AZ', { year: 'numeric', month: 'short', day: 'numeric' });

type ConfirmTarget = { kind: 'single'; id: string; title: string } | { kind: 'bulk'; ids: string[] };

function resolveSelectedIds(selectedKeys: Selection, documents: DocumentRow[]): string[] {
  if (selectedKeys === 'all') return documents.map((d) => d.id);
  return Array.from(selectedKeys).map(String);
}

// Strips the extension and normalizes separators so a filename like
// "yol-hereketi-qaydalari_2024.pdf" becomes a reasonable starting title
// ("yol hereketi qaydalari 2024") the admin can still edit before uploading.
function filenameToTitle(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  return base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function SelectionCheckbox() {
  return (
    <Checkbox slot="selection">
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
      </Checkbox.Content>
    </Checkbox>
  );
}

function DocsTableHeader() {
  const { selectionBehavior, selectionMode } = useTableOptions();
  return (
    <Table.Header>
      {selectionBehavior === 'toggle' && (
        <Table.Column>{selectionMode === 'multiple' && <SelectionCheckbox />}</Table.Column>
      )}
      <Table.Column isRowHeader>Başlıq</Table.Column>
      <Table.Column>Status</Table.Column>
      <Table.Column>Səhifə</Table.Column>
      <Table.Column>Yaradılma tarixi</Table.Column>
      <Table.Column>Əməliyyatlar</Table.Column>
    </Table.Header>
  );
}

function DocsTableRow({
  item,
  reprocessingId,
  deletingId,
  onReprocess,
  onDeleteRequest,
}: {
  item: DocumentRow;
  reprocessingId: string | null;
  deletingId: string | null;
  onReprocess: (id: string) => void;
  onDeleteRequest: (doc: DocumentRow) => void;
}) {
  const { selectionBehavior } = useTableOptions();
  const router = useRouter();
  return (
    <Table.Row id={item.id}>
      {selectionBehavior === 'toggle' && (
        <Table.Cell>
          <SelectionCheckbox />
        </Table.Cell>
      )}
      <Table.Cell className="font-medium">
        <Button
          variant="ghost"
          size="sm"
          className="px-0 h-auto font-medium justify-start hover:text-primary hover:underline"
          onPress={() => router.push(`/admin/documents/${item.id}`)}
        >
          {item.title}
        </Button>
      </Table.Cell>
      <Table.Cell>
        <div className="flex flex-col gap-1">
          <Chip size="sm" color={STATUS_COLOR[item.status]}>
            {item.status}
          </Chip>
          {item.error_message && (
            <span className="mono-label text-on-surface-variant">{item.error_message}</span>
          )}
        </div>
      </Table.Cell>
      <Table.Cell className="mono-label">{item.page_count ?? '—'}</Table.Cell>
      <Table.Cell className="mono-label">{dateFormatter.format(new Date(item.created_at))}</Table.Cell>
      <Table.Cell>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            isPending={reprocessingId === item.id}
            onPress={() => onReprocess(item.id)}
          >
            {({ isPending }) => (
              <>
                {isPending ? <Spinner size="sm" tone="current" /> : null}
                Yenidən emal et
              </>
            )}
          </Button>
          <Button
            variant="danger"
            size="sm"
            isPending={deletingId === item.id}
            onPress={() => onDeleteRequest(item)}
          >
            {({ isPending }) => (
              <>
                {isPending ? <Spinner size="sm" tone="current" /> : null}
                Sil
              </>
            )}
          </Button>
        </div>
      </Table.Cell>
    </Table.Row>
  );
}

function DocsTableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 border-b border-outline-variant/40 px-4 py-3 last:border-b-0">
      <Skeleton className="size-4 shrink-0 rounded" />
      <Skeleton className="h-4 w-40 shrink-0 rounded-full" />
      <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
      <Skeleton className="h-4 w-10 shrink-0 rounded-full" />
      <Skeleton className="h-4 w-24 shrink-0 rounded-full" />
      <div className="ml-auto flex items-center gap-2">
        <Skeleton className="h-8 w-28 shrink-0 rounded-lg" />
        <Skeleton className="h-8 w-16 shrink-0 rounded-lg" />
      </div>
    </div>
  );
}

export default function UploadForm() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reprocessingId, setReprocessingId] = useState<string | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set<Key>());
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const loadDocuments = useCallback(async () => {
    const res = await fetch('/api/admin/documents');
    if (res.ok) {
      const { documents } = await res.json();
      setDocuments(documents);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time fetch on mount
    void loadDocuments();
  }, [loadDocuments]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title.trim()) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title.trim());

    try {
      const res = await fetch('/api/admin/documents', { method: 'POST', body: formData });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? `Yükləmə uğursuz oldu (${res.status})`);
      } else {
        setTitle('');
        setFile(null);
        await loadDocuments();
      }
    } catch {
      setError('Şəbəkə xətası: yükləmə tamamlanmadı');
    } finally {
      setUploading(false);
    }
  }

  async function handleReprocess(id: string) {
    setReprocessingId(id);
    const res = await fetch(`/api/admin/documents/${id}`, { method: 'POST' });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      toast.danger(data?.error ?? 'Yenidən emal uğursuz oldu');
      setReprocessingId(null);
      return;
    }

    toast.success('Sənəd yenidən emala göndərildi');
    await loadDocuments();
    setReprocessingId(null);
  }

  function requestDelete(doc: DocumentRow) {
    setConfirmTarget({ kind: 'single', id: doc.id, title: doc.title });
  }

  function requestBulkDelete() {
    const ids = resolveSelectedIds(selectedKeys, documents);
    if (ids.length === 0) return;
    setConfirmTarget({ kind: 'bulk', ids });
  }

  async function handleConfirmDelete() {
    if (!confirmTarget) return;
    setConfirmBusy(true);

    if (confirmTarget.kind === 'single') {
      setDeletingId(confirmTarget.id);
      const res = await fetch(`/api/admin/documents/${confirmTarget.id}`, { method: 'DELETE' });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.danger(data?.error ?? 'Sənədi silmək uğursuz oldu');
      } else {
        toast.success('Sənəd silindi');
        await loadDocuments();
      }
      setDeletingId(null);
    } else {
      const res = await fetch('/api/admin/documents', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: confirmTarget.ids }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        toast.danger(data?.error ?? 'Sənədləri silmək uğursuz oldu');
      } else {
        toast.success(`${data?.deleted ?? confirmTarget.ids.length} sənəd silindi`);
        setSelectedKeys(new Set());
        await loadDocuments();
      }
    }

    setConfirmBusy(false);
    setConfirmTarget(null);
  }

  const selectedCount = selectedKeys === 'all' ? documents.length : selectedKeys.size;

  return (
    <div className="pt-6 space-y-8">
      <h1 className="text-2xl font-semibold">Sənəd yüklə</h1>

      <Card className="glass-card">
        <form onSubmit={handleUpload}>
          <Card.Content className="flex flex-col gap-4">
            <TextField name="title" isRequired value={title} onChange={setTitle}>
              <Label>Başlıq</Label>
              <Input placeholder="Yol Hərəkəti Qaydaları 2024" />
            </TextField>
            <TextField isRequired>
              <Label>PDF fayl</Label>
              <input
                type="file"
                accept="application/pdf"
                onChange={(e) => {
                  const selected = e.target.files?.[0] ?? null;
                  setFile(selected);
                  // Only auto-fill an empty title — don't clobber a title the
                  // user already typed/edited by hand.
                  if (selected && !title.trim()) {
                    setTitle(filenameToTitle(selected.name));
                  }
                }}
                className="w-full border rounded-md px-3 py-2 text-sm"
                required
              />
            </TextField>
            {error && (
              <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{error}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}
          </Card.Content>
          <Card.Footer>
            <Button type="submit" variant="primary" className="glow-primary" isPending={uploading}>
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner size="sm" tone="current" /> : null}
                  Yüklə
                </>
              )}
            </Button>
          </Card.Footer>
        </form>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-3">Sənədlər</h2>

        {/* Always rendered (not conditional) so this row's height is permanently
            reserved — toggling it in/out of the DOM on selection shifted the table
            below it. Visibility is faded instead so the table's position never moves. */}
        <div
          className={`glass-panel rounded-xl px-4 py-2 flex items-center justify-between mb-3 transition-opacity ${
            selectedCount > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
          aria-hidden={selectedCount === 0}
        >
          <span className="mono-label">{selectedCount} sənəd seçildi</span>
          <Button variant="danger" size="sm" onPress={requestBulkDelete} isDisabled={confirmBusy || selectedCount === 0}>
            Seçilənləri sil
          </Button>
        </div>

        {loading ? (
          <div className="glass-panel rounded-2xl overflow-hidden">
            <DocsTableRowSkeleton />
            <DocsTableRowSkeleton />
            <DocsTableRowSkeleton />
            <DocsTableRowSkeleton />
          </div>
        ) : documents.length === 0 ? (
          <div className="glass-panel rounded-2xl">
            <EmptyState className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-on-surface-variant">
              Hələ sənəd yoxdur
            </EmptyState>
          </div>
        ) : (
          <div className="glass-panel rounded-2xl overflow-hidden">
            <Table.Root>
              <Table.ScrollContainer>
                <Table.Content
                  aria-label="Sənədlər"
                  selectionMode="multiple"
                  selectedKeys={selectedKeys}
                  onSelectionChange={setSelectedKeys}
                >
                  <DocsTableHeader />
                  <Table.Body items={documents}>
                    {(item) => (
                      <DocsTableRow
                        item={item}
                        reprocessingId={reprocessingId}
                        deletingId={deletingId}
                        onReprocess={handleReprocess}
                        onDeleteRequest={requestDelete}
                      />
                    )}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table.Root>
          </div>
        )}
      </div>

      <AlertDialog.Root
        isOpen={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Header>
                <AlertDialog.Heading>
                  {confirmTarget?.kind === 'bulk' ? 'Sənədləri sil' : 'Sənədi sil'}
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                {confirmTarget?.kind === 'bulk'
                  ? `${confirmTarget.ids.length} sənədi silmək istədiyinizə əminsiniz?`
                  : `"${confirmTarget?.title}" sənədini silmək istədiyinizə əminsiniz?`}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="outline" onPress={() => setConfirmTarget(null)} isDisabled={confirmBusy}>
                  Ləğv et
                </Button>
                <Button variant="danger" onPress={handleConfirmDelete} isPending={confirmBusy}>
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
