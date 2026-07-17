'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, TextField, Label, Input, Button, Alert, toast, Skeleton, AlertDialog, EmptyState } from '@heroui/react';
import { Spinner } from '@/components/Spinner';

type Stage = 'analyzing' | 'rewriting' | 'searching' | 'finalizing' | 'streaming';

interface Phrase {
  id: string;
  stage: Stage;
  phrase: string;
  display_order: number;
}

const STAGE_SECTIONS: { stage: Stage; label: string }[] = [
  { stage: 'analyzing', label: 'Analiz' },
  { stage: 'rewriting', label: 'Sorğunun tərtibi' },
  { stage: 'searching', label: 'Axtarış' },
  { stage: 'finalizing', label: 'Yekunlaşdırma' },
  { stage: 'streaming', label: 'Cavab yazılır' },
];

const API_URL = '/api/admin/chat-meta?type=busy-phrases';

export default function BusyPhrasesManager() {
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Phrase | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [newPhraseByStage, setNewPhraseByStage] = useState<Record<Stage, string>>({
    analyzing: '',
    rewriting: '',
    searching: '',
    finalizing: '',
    streaming: '',
  });
  const [addingStage, setAddingStage] = useState<Stage | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(API_URL);
      const data = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok) {
        setError(data?.error ?? 'Status cümlələrini yükləmək uğursuz oldu');
        setLoading(false);
        return;
      }
      const list: Phrase[] = data?.phrases ?? [];
      setPhrases(list);
      setEditValues(Object.fromEntries(list.map((p) => [p.id, p.phrase])));
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const map: Record<Stage, Phrase[]> = {
      analyzing: [],
      rewriting: [],
      searching: [],
      finalizing: [],
      streaming: [],
    };
    for (const p of phrases) map[p.stage]?.push(p);
    for (const stage of Object.keys(map) as Stage[]) {
      map[stage].sort((a, b) => a.display_order - b.display_order);
    }
    return map;
  }, [phrases]);

  async function handleSavePhrase(id: string) {
    const value = editValues[id]?.trim();
    if (!value) {
      setError('Cümlə boş ola bilməz');
      return;
    }
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(API_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, phrase: value }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Yeniləmək uğursuz oldu');
        return;
      }
      setPhrases((prev) => prev.map((p) => (p.id === id ? data.phrase : p)));
      toast.success('Cümlə yeniləndi');
    } finally {
      setSavingId(null);
    }
  }

  async function handleAddPhrase(stage: Stage) {
    const value = newPhraseByStage[stage].trim();
    if (!value) return;
    setAddingStage(stage);
    setError(null);
    try {
      const siblings = grouped[stage];
      const nextOrder = siblings.length > 0 ? Math.max(...siblings.map((p) => p.display_order)) + 1 : 0;
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage, phrase: value, display_order: nextOrder }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.danger(data?.error ?? 'Əlavə etmək uğursuz oldu');
        return;
      }
      setPhrases((prev) => [...prev, data.phrase]);
      setEditValues((prev) => ({ ...prev, [data.phrase.id]: data.phrase.phrase }));
      setNewPhraseByStage((prev) => ({ ...prev, [stage]: '' }));
      toast.success('Cümlə əlavə edildi');
    } finally {
      setAddingStage(null);
    }
  }

  async function handleMove(stage: Stage, index: number, direction: -1 | 1) {
    const siblings = grouped[stage];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= siblings.length) return;
    const current = siblings[index];
    const target = siblings[targetIndex];

    setReorderingId(current.id);
    try {
      const res1 = await fetch(API_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: current.id, display_order: target.display_order }),
      });
      const data1 = await res1.json().catch(() => null);
      if (!res1.ok) {
        toast.danger(data1?.error ?? 'Sıranı dəyişmək uğursuz oldu');
        return;
      }

      const res2 = await fetch(API_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: target.id, display_order: current.display_order }),
      });
      const data2 = await res2.json().catch(() => null);
      if (!res2.ok) {
        toast.danger(data2?.error ?? 'Sıranı dəyişmək uğursuz oldu');
        return;
      }

      setPhrases((prev) =>
        prev.map((p) => {
          if (p.id === data1.phrase.id) return data1.phrase;
          if (p.id === data2.phrase.id) return data2.phrase;
          return p;
        }),
      );
    } finally {
      setReorderingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!confirmTarget) return;
    setConfirmBusy(true);
    try {
      const res = await fetch(`${API_URL}&id=${confirmTarget.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        toast.danger(data?.error ?? 'Silinmə uğursuz oldu');
        return;
      }
      setPhrases((prev) => prev.filter((p) => p.id !== confirmTarget.id));
      toast.success('Cümlə silindi');
    } finally {
      setConfirmBusy(false);
      setConfirmTarget(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {STAGE_SECTIONS.map(({ stage, label }) => {
        const items = grouped[stage];
        return (
          <Card key={stage} className="glass-card">
            <Card.Header>
              <Card.Title>{label}</Card.Title>
            </Card.Header>
            <Card.Content className="flex flex-col gap-3">
              {items.length === 0 ? (
                <EmptyState className="py-6 text-sm text-on-surface-variant">Bu mərhələ üçün cümlə yoxdur</EmptyState>
              ) : (
                items.map((p, index) => {
                  const dirty = editValues[p.id] !== undefined && editValues[p.id] !== p.phrase;
                  return (
                    <div key={p.id} className="flex items-center gap-2">
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          className="mono-label text-on-surface-variant hover:text-on-surface disabled:opacity-30"
                          disabled={index === 0 || reorderingId !== null}
                          onClick={() => void handleMove(stage, index, -1)}
                          aria-label="Yuxarı"
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="mono-label text-on-surface-variant hover:text-on-surface disabled:opacity-30"
                          disabled={index === items.length - 1 || reorderingId !== null}
                          onClick={() => void handleMove(stage, index, 1)}
                          aria-label="Aşağı"
                        >
                          ▼
                        </button>
                      </div>
                      <TextField
                        value={editValues[p.id] ?? p.phrase}
                        onChange={(value) => setEditValues((prev) => ({ ...prev, [p.id]: value }))}
                        className="flex-1"
                        aria-label={`${label} cümləsi`}
                      >
                        <Input />
                      </TextField>
                      <Button
                        variant="outline"
                        size="sm"
                        isDisabled={!dirty}
                        isPending={savingId === p.id}
                        onPress={() => void handleSavePhrase(p.id)}
                      >
                        {({ isPending }) => (
                          <>
                            {isPending ? <Spinner size="sm" tone="current" /> : null}
                            Yadda saxla
                          </>
                        )}
                      </Button>
                      <Button variant="danger" size="sm" onPress={() => setConfirmTarget(p)}>
                        Sil
                      </Button>
                    </div>
                  );
                })
              )}

              <div className="flex items-center gap-2 pt-2 border-t border-outline-variant/40">
                <TextField
                  value={newPhraseByStage[stage]}
                  onChange={(value) => setNewPhraseByStage((prev) => ({ ...prev, [stage]: value }))}
                  className="flex-1"
                  aria-label={`${label} üçün yeni cümlə`}
                >
                  <Label className="sr-only">Yeni cümlə</Label>
                  <Input placeholder="Yeni cümlə əlavə et..." />
                </TextField>
                <Button
                  variant="primary"
                  size="sm"
                  isDisabled={!newPhraseByStage[stage].trim()}
                  isPending={addingStage === stage}
                  onPress={() => void handleAddPhrase(stage)}
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner size="sm" tone="current" /> : null}
                      Əlavə et
                    </>
                  )}
                </Button>
              </div>
            </Card.Content>
          </Card>
        );
      })}

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
                <AlertDialog.Heading>Cümləni sil</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                {confirmTarget ? `"${confirmTarget.phrase}" cümləsini silmək istədiyinizə əminsiniz?` : null}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="outline" onPress={() => setConfirmTarget(null)} isDisabled={confirmBusy}>
                  Ləğv et
                </Button>
                <Button variant="danger" onPress={() => void handleConfirmDelete()} isPending={confirmBusy}>
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
