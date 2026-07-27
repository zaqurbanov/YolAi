'use client';

import { useEffect, useState } from 'react';
import { Chip, Button, TextField, Input, Skeleton } from '@heroui/react';
import { Spinner } from '@/components/Spinner';

type Source = 'table' | 'default';

interface Setting {
  value: number;
  source: Source;
}

type Param = 'garageXoBonusPct' | 'garageEnergyBonus' | 'garageChatDailyBonus';

type Settings = Record<Param, Setting>;

// Mirrors GARAGE_PERK_FIELDS in app/api/admin/chat-meta/route.ts. The server
// is authoritative — these bounds only exist to fail fast before a round trip.
const FIELDS: {
  param: Param;
  label: string;
  hint: string;
  integerOnly: boolean;
  min: number;
  max: number;
}[] = [
  {
    param: 'garageXoBonusPct',
    label: 'Lada 2107 — XO coin bonusu (%)',
    hint: 'XO oyununda qazanılan coinə əlavə faiz bonusu.',
    integerOnly: false,
    min: 0,
    max: 1000,
  },
  {
    param: 'garageEnergyBonus',
    label: 'Toyota Prius — gündəlik enerji bonusu',
    hint: 'Gündəlik enerji qrantına əlavə sabit miqdar.',
    integerOnly: true,
    min: 0,
    max: 1000,
  },
  {
    param: 'garageChatDailyBonus',
    label: 'Mercedes G-Class — gündəlik pulsuz sual bonusu',
    hint: 'Gündəlik pulsuz chat mesaj limitinə əlavə sabit miqdar.',
    integerOnly: true,
    min: 0,
    max: 1000,
  },
];

const ENDPOINT = '/api/admin/chat-meta?type=garage-perks';

// Virtual Qaraj Phase 2 (Mərhələ 2) — per-tier perk tunables, one card sharing
// one endpoint/partial-PATCH, same pattern as GameRewardsControl.
export default function GaragePerksControl() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [pendingParam, setPendingParam] = useState<Param | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Param, string>>>({});

  function applySettings(data: Settings) {
    setSettings(data);
    setInputs(Object.fromEntries(FIELDS.map((f) => [f.param, String(data[f.param].value)])));
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(ENDPOINT);
      if (res.ok && !cancelled) {
        const data: { settings: Settings } = await res.json();
        applySettings(data.settings);
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(param: Param, value: number | null) {
    setPendingParam(param);
    setErrors((prev) => ({ ...prev, [param]: undefined }));
    try {
      const res = await fetch(ENDPOINT, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        // Partial body: only the edited param is sent, so a stale value in
        // another field can't be written back over a concurrent change.
        body: JSON.stringify({ [param]: value }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrors((prev) => ({ ...prev, [param]: data?.error ?? 'Ayarı yeniləmək uğursuz oldu' }));
        return;
      }
      applySettings(data.settings);
    } finally {
      setPendingParam(null);
    }
  }

  function handleSave(field: (typeof FIELDS)[number]) {
    const trimmed = (inputs[field.param] ?? '').trim();
    const value = Number(trimmed);
    const invalid =
      trimmed === '' ||
      !Number.isFinite(value) ||
      (field.integerOnly && !Number.isInteger(value)) ||
      value < field.min ||
      value > field.max;

    if (invalid) {
      setErrors((prev) => ({
        ...prev,
        [field.param]: `${field.min}-${field.max} arasında ${field.integerOnly ? 'tam ' : ''}ədəd olmalıdır`,
      }));
      return;
    }
    void save(field.param, value);
  }

  return (
    <div className="glass-card rounded-2xl p-4 lg:col-span-2">
      <div className="mono-label text-on-surface-variant uppercase">Qaraj perkləri</div>

      {loading ? (
        <div className="mt-4 space-y-3">
          {FIELDS.map((f) => (
            <Skeleton key={f.param} className="h-10 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-3 divide-y divide-outline-variant/30">
          {FIELDS.map((field) => {
            const setting = settings?.[field.param];
            const isPending = pendingParam === field.param;
            const error = errors[field.param];

            return (
              <div
                key={field.param}
                className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-on-surface">{field.label}</span>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={setting?.source === 'table' ? 'accent' : 'default'}
                      className="mono-label"
                    >
                      {setting?.source === 'table' ? 'admin təyin edib' : 'standart'}
                    </Chip>
                  </div>
                  <p className="mt-0.5 text-label-sm text-on-surface-variant">{field.hint}</p>
                  {error && <span className="mono-label text-danger">{error}</span>}
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <TextField
                    type="number"
                    value={inputs[field.param] ?? ''}
                    onChange={(v) => setInputs((prev) => ({ ...prev, [field.param]: v }))}
                    className="w-28"
                    aria-label={field.label}
                  >
                    <Input
                      min={field.min}
                      max={field.max}
                      step={field.integerOnly ? 1 : 0.01}
                    />
                  </TextField>
                  <Button
                    variant="outline"
                    size="sm"
                    isPending={isPending}
                    isDisabled={pendingParam !== null && !isPending}
                    onPress={() => handleSave(field)}
                  >
                    {({ isPending: p }) => (
                      <>
                        {p ? <Spinner size="sm" tone="current" /> : null}
                        Yadda saxla
                      </>
                    )}
                  </Button>
                  {setting?.source === 'table' && (
                    <Button
                      variant="outline"
                      size="sm"
                      isDisabled={pendingParam !== null}
                      onPress={() => void save(field.param, null)}
                    >
                      Standarta qaytar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
