'use client';

import { useEffect, useState } from 'react';
import { Chip, Button, TextField, Input, Skeleton } from '@heroui/react';
import { Spinner } from '@/components/Spinner';

type Source = 'table' | 'default';

interface EnergyToCoinConfig {
  energyUnit: number;
  coinRate: number;
  dailyCap: number;
}

interface EnergyToCoinResponse {
  config: EnergyToCoinConfig;
  source: Source;
}

// Mirrors ENERGY_TO_COIN_FIELDS in app/api/admin/chat-meta/route.ts. The server
// is authoritative — these bounds only exist to fail fast before a round trip.
const FIELDS: {
  param: keyof EnergyToCoinConfig;
  label: string;
  hint: string;
  integerOnly: boolean;
  min: number;
  max: number;
}[] = [
  {
    param: 'energyUnit',
    label: 'Enerji vahidi',
    hint: '100 enerji üçün bazdır',
    integerOnly: true,
    min: 1,
    max: 10000,
  },
  {
    param: 'coinRate',
    label: 'Coin nisbəti',
    hint: 'Hər vahid üçün verilən coin',
    integerOnly: false,
    min: 0.01,
    max: 1000,
  },
  {
    param: 'dailyCap',
    label: 'Gündəlik limit',
    hint: 'Gündə çevrilə biləcək enerji miqdarı',
    integerOnly: true,
    min: 1,
    max: 10000,
  },
];

const ENDPOINT = '/api/admin/chat-meta?type=energy-to-coin';

// The three tunables behind the single owner-sanctioned energy -> coin path
// (0096_energy_to_coin.sql). Flat { energyUnit, coinRate, dailyCap } config with
// one group-level source — the endpoint returns effective numbers + whether any
// key is overridden, unlike the per-field value/source objects of the other
// groups. Empty field => sent as null (resets that key to its TS default).
export default function EnergyToCoinControl() {
  const [data, setData] = useState<EnergyToCoinResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [pendingField, setPendingField] = useState<keyof EnergyToCoinConfig | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof EnergyToCoinConfig, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function applyData(res: EnergyToCoinResponse) {
    setData(res);
    setInputs(Object.fromEntries(FIELDS.map((f) => [f.param, String(res.config[f.param])])));
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(ENDPOINT);
      if (res.ok && !cancelled) {
        const json: EnergyToCoinResponse = await res.json();
        applyData(json);
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(payload: Record<string, number | null>, field?: keyof EnergyToCoinConfig) {
    if (field) setPendingField(field);
    else setPending(true);
    setFormError(null);
    setErrors({});
    try {
      const res = await fetch(ENDPOINT, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormError(json?.error ?? 'Ayarı yeniləmək uğursuz oldu');
        return;
      }
      applyData(json as EnergyToCoinResponse);
    } finally {
      if (field) setPendingField(null);
      else setPending(false);
    }
  }

  function handleSaveAll() {
    const payload: Record<string, number | null> = {};
    const nextErrors: Partial<Record<keyof EnergyToCoinConfig, string>> = {};
    let hasInvalid = false;

    for (const f of FIELDS) {
      const trimmed = (inputs[f.param] ?? '').trim();
      if (trimmed === '') {
        payload[f.param] = null;
        continue;
      }
      const value = Number(trimmed);
      if (
        !Number.isFinite(value) ||
        (f.integerOnly && !Number.isInteger(value)) ||
        value < f.min ||
        value > f.max
      ) {
        nextErrors[f.param] = `${f.min}-${f.max} arasında ${f.integerOnly ? 'tam ' : ''}ədəd olmalıdır`;
        hasInvalid = true;
        continue;
      }
      payload[f.param] = value;
    }

    setErrors(nextErrors);
    if (hasInvalid) return;
    void save(payload);
  }

  function handleReset(field: keyof EnergyToCoinConfig) {
    void save({ [field]: null }, field);
  }

  return (
    <div className="glass-card rounded-2xl p-4 lg:col-span-2">
      <div className="flex items-center justify-between gap-2">
        <div className="mono-label text-on-surface-variant uppercase">Enerji → Coin konversiyası</div>
        {data && (
          <Chip
            size="sm"
            variant="soft"
            color={data.source === 'table' ? 'accent' : 'default'}
            className="mono-label"
          >
            {data.source === 'table' ? 'admin təyin edib' : 'standart'}
          </Chip>
        )}
      </div>

      {loading ? (
        <div className="mt-4 space-y-3">
          {FIELDS.map((f) => (
            <Skeleton key={f.param} className="h-10 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-3">
          <div className="divide-y divide-outline-variant/30">
            {FIELDS.map((field) => {
              const error = errors[field.param];
              const isPending = pendingField === field.param;
              return (
                <div
                  key={field.param}
                  className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <span className="font-medium text-on-surface">{field.label}</span>
                    <p className="mt-0.5 text-label-sm text-on-surface-variant">{field.hint}</p>
                    {error && <span className="mono-label text-danger">{error}</span>}
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <TextField
                      type="number"
                      value={inputs[field.param] ?? ''}
                      onChange={(v) => {
                        setInputs((prev) => ({ ...prev, [field.param]: v }));
                        setErrors((prev) => ({ ...prev, [field.param]: undefined }));
                        setFormError(null);
                      }}
                      className="w-32"
                      aria-label={field.label}
                    >
                      <Input min={field.min} max={field.max} step={field.integerOnly ? 1 : 0.01} />
                    </TextField>
                    {data?.source === 'table' && (
                      <Button
                        variant="outline"
                        size="sm"
                        isPending={isPending}
                        isDisabled={pending || (pendingField !== null && !isPending)}
                        onPress={() => handleReset(field.param)}
                      >
                        {({ isPending: p }) => (
                          <>
                            {p ? <Spinner size="sm" tone="current" /> : null}
                            Standarta qaytar
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-outline-variant/30 pt-4">
            {formError && <span className="mono-label text-danger">{formError}</span>}
            <Button
              variant="primary"
              isPending={pending}
              isDisabled={pending || pendingField !== null}
              onPress={handleSaveAll}
            >
              {({ isPending: p }) => (
                <>
                  {p ? <Spinner size="sm" tone="current" /> : null}
                  Yadda saxla
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
