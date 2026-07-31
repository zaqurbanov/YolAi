'use client';

import { useEffect, useState } from 'react';
import { Chip, Button, TextField, Input, Skeleton } from '@heroui/react';
import { Spinner } from '@/components/Spinner';

interface CircuitBreakerSettings {
  cap: number;
  source: 'table' | 'default';
  usedToday: number | null;
  date: string;
}

export default function LlmCircuitBreakerControl() {
  const [settings, setSettings] = useState<CircuitBreakerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch('/api/admin/chat-meta?type=llm-circuit-breaker');
      if (res.ok && !cancelled) {
        const data: CircuitBreakerSettings = await res.json();
        setSettings(data);
        setInputValue(String(data.cap));
      }
      if (!cancelled) setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(cap: number | null) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/chat-meta?type=llm-circuit-breaker', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cap }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Ayarı yeniləmək uğursuz oldu');
        return;
      }
      // PATCH returns only { cap, source } — usedToday/date come from GET and
      // are unchanged by an edit, so they're carried over rather than dropped.
      setSettings((prev) => ({
        cap: data.cap,
        source: data.source,
        usedToday: prev?.usedToday ?? null,
        date: prev?.date ?? '',
      }));
      setInputValue(String(data.cap));
    } finally {
      setPending(false);
    }
  }

  function handleSave() {
    const trimmed = inputValue.trim();
    const value = Number(trimmed);
    if (trimmed === '' || !Number.isInteger(value) || value <= 0) {
      setError('Limit müsbət tam ədəd olmalıdır');
      return;
    }
    void save(value);
  }

  function handleReset() {
    void save(null);
  }

  const used = settings?.usedToday ?? null;
  const cap = settings?.cap ?? 0;
  const usageKnown = used !== null && cap > 0;
  const usagePct = usageKnown ? Math.min(100, (used / cap) * 100) : 0;
  // Colour thresholds: reaching the cap is an incident, 80%+ is the warning
  // window an admin should act inside (raise the cap or investigate abuse).
  const barColor = usagePct >= 100 ? 'bg-error' : usagePct >= 80 ? 'bg-caution-orange' : 'bg-primary';

  return (
    <div className="glass-card rounded-2xl p-4 flex flex-col gap-4">
      <div>
        <div className="mono-label text-on-surface-variant uppercase">Gündəlik LLM sorğu limiti (qlobal)</div>
        {loading ? (
          <Skeleton className="h-6 w-32 mt-2 rounded-full" />
        ) : (
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="text-xl font-semibold text-on-surface">{cap}</span>
            <Chip
              size="sm"
              variant="soft"
              color={settings?.source === 'table' ? 'accent' : 'default'}
              className="mono-label"
            >
              {settings?.source === 'table' ? 'admin təyin edib' : 'standart'}
            </Chip>
          </div>
        )}
        <p className="mt-2 text-sm text-on-surface-variant">
          Bütün istifadəçilər (adminlər daxil) üzrə ÜMUMİ gündəlik hədd — istifadəçi başına deyil. Bakı vaxtı ilə gecə
          yarısı sıfırlanır. Hədd dolanda söhbət bütün istifadəçilər üçün dayanır.
        </p>
      </div>

      {!loading && (
        <div>
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <span className="mono-label text-on-surface">
              Bu gün: {usageKnown ? `${used} / ${cap}` : `naməlum / ${cap}`}
            </span>
            {settings?.date && <span className="mono-label text-on-surface-variant">{settings.date} (Bakı)</span>}
          </div>
          <div className="mt-2 h-3 rounded-full bg-surface-container-high overflow-hidden">
            {usageKnown ? (
              <div
                className={`h-full rounded-full ${barColor} transition-all`}
                style={{ width: `${Math.max(usagePct > 0 ? 2 : 0, usagePct)}%` }}
              />
            ) : null}
          </div>
          {!usageKnown && (
            <p className="mt-2 mono-label text-on-surface-variant">
              Sayğac oxunmadı — çox güman ki 0093 migrasiyası hələ tətbiq edilməyib.
            </p>
          )}
          {usagePct >= 100 && (
            <p className="mt-2 mono-label text-error">Hədd dolub — söhbət bu gün üçün dayandırılıb.</p>
          )}
        </div>
      )}

      {!loading && (
        <div className="flex items-center gap-2 flex-wrap">
          <TextField
            type="number"
            value={inputValue}
            onChange={setInputValue}
            className="w-32"
            aria-label="Qlobal gündəlik LLM sorğu limiti"
          >
            <Input min={1} max={100000} />
          </TextField>
          <Button variant="outline" size="sm" isPending={pending} onPress={handleSave}>
            {({ isPending }) => (
              <>
                {isPending ? <Spinner size="sm" tone="current" /> : null}
                Yadda saxla
              </>
            )}
          </Button>
          {settings?.source === 'table' && (
            <Button variant="outline" size="sm" isPending={pending} onPress={handleReset}>
              Standarta qaytar
            </Button>
          )}
          {error && <span className="mono-label text-error">{error}</span>}
        </div>
      )}
    </div>
  );
}
