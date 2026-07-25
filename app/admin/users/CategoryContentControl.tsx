'use client';

import { useEffect, useState } from 'react';
import { Accordion, Chip, Button, TextField, Input, Skeleton } from '@heroui/react';
import { Spinner } from '@/components/Spinner';

type Source = 'table' | 'default';

interface FieldSetting {
  value: string;
  source: Source;
}

const FIELDS = [
  { field: 'description', label: 'Təsvir' },
  { field: 'citation', label: 'İstinad' },
  { field: 'question', label: 'Chat sualı' },
] as const;

type Field = (typeof FIELDS)[number]['field'];

interface CategoryEntry {
  title: string;
  description: FieldSetting;
  citation: FieldSetting;
  question: FieldSetting;
}

// Mirrors MAX_CATEGORY_FIELD_LENGTH in app/api/admin/chat-meta/route.ts. The
// server is authoritative — this bound only fails fast before a round trip.
const MAX_LENGTH = 300;

const ENDPOINT = '/api/admin/chat-meta?type=category-content';

// Admin overrides for the home-page category cards' text (description /
// citation / chat-prefill question), 8 fixed categories behind one accordion
// so the card isn't a wall of 24 inputs. Same value/source convention and
// partial-PATCH pattern as LessonEconomyControl.
export default function CategoryContentControl() {
  const [categories, setCategories] = useState<CategoryEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState<Record<string, Record<Field, string>>>({});
  const [pendingTitle, setPendingTitle] = useState<string | null>(null);
  const [resetPending, setResetPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  function applyCategories(data: CategoryEntry[]) {
    setCategories(data);
    setInputs(
      Object.fromEntries(
        data.map((c) => [
          c.title,
          Object.fromEntries(FIELDS.map((f) => [f.field, c[f.field].value])) as Record<Field, string>,
        ])
      )
    );
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(ENDPOINT);
      if (res.ok && !cancelled) {
        const data: { categories: CategoryEntry[] } = await res.json();
        applyCategories(data.categories);
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function patch(title: string, overrides: Partial<Record<Field, string>>) {
    setPendingTitle(title);
    setErrors((prev) => ({ ...prev, [title]: undefined }));
    try {
      const res = await fetch(ENDPOINT, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Partial body: only the edited fields of the edited category are
        // sent, so a stale value elsewhere can't overwrite a concurrent change.
        body: JSON.stringify({ overrides: { [title]: overrides } }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [title]: data?.error ?? 'Ayarı yeniləmək uğursuz oldu' }));
        return;
      }
      applyCategories(data.categories);
    } finally {
      setPendingTitle(null);
    }
  }

  function handleSave(category: CategoryEntry) {
    const entry = inputs[category.title];
    if (!entry) return;

    const overrides: Partial<Record<Field, string>> = {};
    for (const { field } of FIELDS) {
      const trimmed = entry[field].trim();
      if (trimmed.length > MAX_LENGTH) {
        setErrors((prev) => ({
          ...prev,
          [category.title]: `Hər sahə maksimum ${MAX_LENGTH} simvol ola bilər`,
        }));
        return;
      }
      const current = category[field];
      // Empty input on an overridden field = reset that field ("" resets
      // server-side); empty on a default field is a no-op, not "set to empty".
      if (trimmed === '') {
        if (current.source === 'table') overrides[field] = '';
        continue;
      }
      if (trimmed !== current.value) overrides[field] = trimmed;
    }

    if (Object.keys(overrides).length === 0) {
      setErrors((prev) => ({ ...prev, [category.title]: undefined }));
      return;
    }
    void patch(category.title, overrides);
  }

  async function handleResetAll() {
    setResetPending(true);
    setErrors({});
    try {
      const res = await fetch(ENDPOINT, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrors({ _global: data?.error ?? 'Ayarları sıfırlamaq uğursuz oldu' });
        return;
      }
      applyCategories(data.categories);
    } finally {
      setResetPending(false);
    }
  }

  const anyOverride = categories?.some((c) => FIELDS.some((f) => c[f.field].source === 'table'));

  return (
    <div className="glass-card rounded-2xl p-4 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="mono-label text-on-surface-variant uppercase">
          Ana səhifə kateqoriya mətnləri
        </div>
        {anyOverride && (
          <Button
            variant="outline"
            size="sm"
            isPending={resetPending}
            isDisabled={pendingTitle !== null}
            onPress={() => void handleResetAll()}
          >
            {({ isPending }) => (
              <>
                {isPending ? <Spinner size="sm" tone="current" /> : null}
                Hamısını standarta qaytar
              </>
            )}
          </Button>
        )}
      </div>
      <p className="mt-0.5 text-label-sm text-on-surface-variant">
        Kateqoriya kartlarının təsviri, istinadı və karta kliklədikdə chat-ə yazılan sual. Sahəni
        boşaldıb yadda saxlamaq onu standarta qaytarır.
      </p>
      {errors._global && <span className="mono-label text-danger">{errors._global}</span>}

      {loading ? (
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <Accordion className="mt-3 w-full">
          {(categories ?? []).map((category) => {
            const overriddenCount = FIELDS.filter((f) => category[f.field].source === 'table').length;
            const isPending = pendingTitle === category.title;
            const error = errors[category.title];

            return (
              <Accordion.Item key={category.title} id={category.title}>
                <Accordion.Heading>
                  <Accordion.Trigger>
                    <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <span className="truncate font-medium text-on-surface">{category.title}</span>
                      <Chip
                        size="sm"
                        variant="soft"
                        color={overriddenCount > 0 ? 'accent' : 'default'}
                        className="mono-label shrink-0"
                      >
                        {overriddenCount > 0 ? `${overriddenCount} sahə admin təyin edib` : 'standart'}
                      </Chip>
                    </span>
                    <Accordion.Indicator />
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body>
                    <div className="flex flex-col gap-3 pb-1">
                      {FIELDS.map(({ field, label }) => {
                        const setting = category[field];
                        return (
                          <div key={field} className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className="text-label-sm text-on-surface-variant">{label}</span>
                              <Chip
                                size="sm"
                                variant="soft"
                                color={setting.source === 'table' ? 'accent' : 'default'}
                                className="mono-label"
                              >
                                {setting.source === 'table' ? 'admin təyin edib' : 'standart'}
                              </Chip>
                            </div>
                            <TextField
                              value={inputs[category.title]?.[field] ?? ''}
                              onChange={(v) =>
                                setInputs((prev) => ({
                                  ...prev,
                                  [category.title]: { ...prev[category.title], [field]: v },
                                }))
                              }
                              className="w-full"
                              aria-label={`${category.title} — ${label}`}
                            >
                              <Input maxLength={MAX_LENGTH} />
                            </TextField>
                          </div>
                        );
                      })}

                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          isPending={isPending}
                          isDisabled={(pendingTitle !== null && !isPending) || resetPending}
                          onPress={() => handleSave(category)}
                        >
                          {({ isPending: p }) => (
                            <>
                              {p ? <Spinner size="sm" tone="current" /> : null}
                              Yadda saxla
                            </>
                          )}
                        </Button>
                        {overriddenCount > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            isDisabled={pendingTitle !== null || resetPending}
                            onPress={() =>
                              void patch(
                                category.title,
                                Object.fromEntries(
                                  FIELDS.filter((f) => category[f.field].source === 'table').map(
                                    (f) => [f.field, '']
                                  )
                                )
                              )
                            }
                          >
                            Standarta qaytar
                          </Button>
                        )}
                        {error && <span className="mono-label text-danger">{error}</span>}
                      </div>
                    </div>
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}
