'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Chip, Button, EmptyState, TextField, Input } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import type {
  AdminUserDetail,
  AdminUserConversationsPage,
  AdminUserConversation,
  AdminUserMessage,
} from '@/lib/admin/getUserDetail';

interface Citation {
  document_id?: string;
  title?: string;
  page?: number | null;
  article_label?: string | null;
}

const dateFormatter = new Intl.DateTimeFormat('az-AZ', { year: 'numeric', month: 'short', day: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('az-AZ', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatCitation(c: Citation): string {
  const parts = [c.title ?? 'Naməlum sənəd'];
  if (c.article_label) parts.push(c.article_label);
  if (c.page) parts.push(`səh. ${c.page}`);
  return parts.join(' · ');
}

function ConversationMessages({ messages }: { messages: AdminUserMessage[] }) {
  return (
    <div className="space-y-3 p-4 pt-0">
      {messages.map((m) => {
        const isUser = m.role === 'user';
        const citations = Array.isArray(m.citations) ? (m.citations as Citation[]) : [];
        return (
          <div key={m.id} className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                isUser
                  ? 'bg-primary text-on-primary rounded-tr-none'
                  : 'glass-panel rounded-tl-none text-on-surface'
              }`}
            >
              {m.content}
            </div>
            {!isUser && citations.length > 0 && (
              <div className="flex max-w-[85%] flex-wrap gap-1.5">
                {citations.map((c, i) => (
                  <Chip key={i} size="sm" variant="soft" color="accent" className="mono-label">
                    {formatCitation(c)}
                  </Chip>
                ))}
              </div>
            )}
            <span className="mono-label px-1 text-on-surface-variant" suppressHydrationWarning>
              {dateTimeFormatter.format(new Date(m.created_at))}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ConversationItem({ conversation, index }: { conversation: AdminUserConversation; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const title = conversation.title ?? `Söhbət #${index + 1}`;

  return (
    <div className="glass-panel rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-container-high/40"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="truncate text-sm font-medium text-on-surface">{title}</span>
          <span className="mono-label shrink-0 text-on-surface-variant">
            {conversation.messages.length} mesaj
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="mono-label text-on-surface-variant" suppressHydrationWarning>
            {dateFormatter.format(new Date(conversation.created_at))}
          </span>
          <span className="mono-label text-on-surface-variant">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>
      {expanded && <ConversationMessages messages={conversation.messages} />}
    </div>
  );
}

function RoleControl({
  userId,
  role,
  onChanged,
}: {
  userId: string;
  role: string;
  onChanged: (role: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = role === 'admin' ? 'user' : 'admin';
  const label = role === 'admin' ? 'Admin roluna endir' : 'Admin təyin et';

  async function changeRole() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: target }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Rolu dəyişmək uğursuz oldu');
        return;
      }
      onChanged(data.profile.role);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" isPending={pending} onPress={changeRole}>
        {({ isPending }) => (
          <>
            {isPending ? <Spinner size="sm" tone="current" /> : null}
            {label}
          </>
        )}
      </Button>
      {error && <span className="mono-label text-danger">{error}</span>}
    </div>
  );
}

function formatCoinBalance(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

function DailyCoinLimitControl({
  userId,
  dailyCoinLimit,
  onChanged,
}: {
  userId: string;
  dailyCoinLimit: number | null;
  onChanged: (value: number | null) => void;
}) {
  const [inputValue, setInputValue] = useState(dailyCoinLimit != null ? String(dailyCoinLimit) : '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = inputValue.trim() !== (dailyCoinLimit != null ? String(dailyCoinLimit) : '');

  async function save() {
    const trimmed = inputValue.trim();
    const dailyCoinLimitValue = trimmed === '' ? null : Number(trimmed);

    if (dailyCoinLimitValue !== null && (!Number.isFinite(dailyCoinLimitValue) || dailyCoinLimitValue <= 0)) {
      setError('Limit müsbət ədəd olmalıdır');
      return;
    }

    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dailyCoinLimit: dailyCoinLimitValue }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Limiti dəyişmək uğursuz oldu');
        return;
      }
      const newLimit = data.coins?.daily_limit ?? null;
      onChanged(newLimit);
      setInputValue(newLimit != null ? String(newLimit) : '');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <TextField
        type="number"
        value={inputValue}
        onChange={setInputValue}
        className="w-32"
        aria-label="Gündəlik coin limiti"
      >
        <Input placeholder="Standart" min={0.01} max={100000} step={0.01} />
      </TextField>
      <Button variant="outline" size="sm" isPending={pending} isDisabled={!dirty} onPress={save}>
        {({ isPending }) => (
          <>
            {isPending ? <Spinner size="sm" tone="current" /> : null}
            Yadda saxla
          </>
        )}
      </Button>
      {error && <span className="mono-label text-danger">{error}</span>}
    </div>
  );
}

function GrantCoinsControl({
  userId,
  onGranted,
}: {
  userId: string;
  onGranted: (newBalance: number) => void;
}) {
  const [inputValue, setInputValue] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function grant(amount: number) {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grantCoins: amount }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Coin hədiyyə etmək uğursuz oldu');
        return;
      }
      if (data.coins?.balance != null) onGranted(Number(data.coins.balance));
      setInputValue('');
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(sign: 1 | -1) {
    const trimmed = inputValue.trim();
    if (trimmed === '') {
      setError('Miqdar sıfırdan fərqli ədəd olmalıdır');
      return;
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value === 0) {
      setError('Miqdar sıfırdan fərqli ədəd olmalıdır');
      return;
    }
    void grant(sign * Math.abs(value));
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <TextField
        type="number"
        value={inputValue}
        onChange={setInputValue}
        className="w-32"
        aria-label="Hədiyyə ediləcək coin miqdarı"
      >
        <Input placeholder="Miqdar" min={0.01} max={100000} step={0.01} />
      </TextField>
      <Button variant="outline" size="sm" isPending={pending} onPress={() => handleSubmit(1)}>
        {({ isPending }) => (
          <>
            {isPending ? <Spinner size="sm" tone="current" /> : null}
            Əlavə et
          </>
        )}
      </Button>
      <Button variant="outline" size="sm" isPending={pending} onPress={() => handleSubmit(-1)}>
        Çıxart
      </Button>
      {error && <span className="mono-label text-danger">{error}</span>}
    </div>
  );
}

function RateLimitControl({
  userId,
  customMaxPerDay,
  onChanged,
}: {
  userId: string;
  customMaxPerDay: number | null;
  onChanged: (value: number | null) => void;
}) {
  const [inputValue, setInputValue] = useState(customMaxPerDay != null ? String(customMaxPerDay) : '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = inputValue.trim() !== (customMaxPerDay != null ? String(customMaxPerDay) : '');

  async function save() {
    const trimmed = inputValue.trim();
    const customMaxPerDayValue = trimmed === '' ? null : Number(trimmed);

    if (customMaxPerDayValue !== null && (!Number.isInteger(customMaxPerDayValue) || customMaxPerDayValue <= 0)) {
      setError('Limit müsbət tam ədəd olmalıdır');
      return;
    }

    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customMaxPerDay: customMaxPerDayValue }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? 'Limiti dəyişmək uğursuz oldu');
        return;
      }
      onChanged(data.profile.custom_max_per_day);
      setInputValue(data.profile.custom_max_per_day != null ? String(data.profile.custom_max_per_day) : '');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <TextField
        type="number"
        value={inputValue}
        onChange={setInputValue}
        className="w-32"
        aria-label="Gündəlik mesaj limiti"
      >
        <Input placeholder="Standart" min={1} max={100000} />
      </TextField>
      <Button variant="outline" size="sm" isPending={pending} isDisabled={!dirty} onPress={save}>
        {({ isPending }) => (
          <>
            {isPending ? <Spinner size="sm" tone="current" /> : null}
            Yadda saxla
          </>
        )}
      </Button>
      {error && <span className="mono-label text-danger">{error}</span>}
    </div>
  );
}

export default function UserDetail({
  userId,
  detail,
  initialConversations,
}: {
  userId: string;
  detail: AdminUserDetail;
  initialConversations: AdminUserConversationsPage;
}) {
  const { profile, stats } = detail;
  const [role, setRole] = useState(profile.role);
  const [customMaxPerDay, setCustomMaxPerDay] = useState(profile.custom_max_per_day);
  const [coinBalance, setCoinBalance] = useState(detail.coins?.balance ?? null);
  const [dailyCoinLimit, setDailyCoinLimit] = useState(detail.coins?.daily_limit ?? null);

  const [conversations, setConversations] = useState<AdminUserConversation[]>(
    initialConversations.conversations
  );
  const [total, setTotal] = useState(initialConversations.total);
  const [hasMore, setHasMore] = useState(initialConversations.hasMore);
  const [loadingMore, setLoadingMore] = useState(false);

  async function loadMore() {
    setLoadingMore(true);
    const res = await fetch(
      `/api/admin/users/${userId}?limit=10&offset=${conversations.length}`
    );
    if (res.ok) {
      const data: AdminUserConversationsPage = await res.json();
      setConversations((prev) => [...prev, ...data.conversations]);
      setTotal(data.total);
      setHasMore(data.hasMore);
    }
    setLoadingMore(false);
  }

  const statCards = [
    { label: 'Söhbətlər', value: stats.totalConversations },
    { label: 'İstifadəçi mesajları', value: stats.totalUserMessages },
    { label: 'Köməkçi cavabları', value: stats.totalAssistantMessages },
    {
      label: 'İlk fəaliyyət',
      value: stats.firstActivityAt ? dateFormatter.format(new Date(stats.firstActivityAt)) : '—',
    },
    {
      label: 'Son fəaliyyət',
      value: stats.lastActivityAt ? dateFormatter.format(new Date(stats.lastActivityAt)) : '—',
    },
  ];

  return (
    <div className="pt-6 space-y-8">
      <div>
        <Link href="/admin/users" className="mono-label text-on-surface-variant hover:text-primary">
          ← Geri
        </Link>
      </div>

      <div className="glass-card rounded-2xl p-6 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl font-semibold text-on-surface">
            {profile.full_name ?? profile.email ?? 'Naməlum istifadəçi'}
          </h1>
          <Chip size="sm" color={role === 'admin' ? 'success' : 'default'}>
            {role}
          </Chip>
          <RoleControl userId={userId} role={role} onChanged={setRole} />
        </div>
        <div className="flex flex-wrap gap-6 mono-label text-on-surface-variant">
          <span>E-poçt: {profile.email ?? '—'}</span>
          <span suppressHydrationWarning>
            Üzv olub: {dateFormatter.format(new Date(profile.created_at))}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <span className="mono-label text-on-surface-variant">
            Gündəlik mesaj limiti:{' '}
            {customMaxPerDay != null ? (
              <span className="text-on-surface font-medium">{customMaxPerDay}</span>
            ) : (
              <span className="text-on-surface font-medium">standart</span>
            )}
          </span>
          <RateLimitControl userId={userId} customMaxPerDay={customMaxPerDay} onChanged={setCustomMaxPerDay} />
        </div>
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <span className="mono-label text-on-surface-variant">
            Coin balansı:{' '}
            <span className="text-on-surface font-medium">
              {coinBalance != null ? formatCoinBalance(coinBalance) : '—'}
            </span>
          </span>
          <GrantCoinsControl userId={userId} onGranted={setCoinBalance} />
        </div>
        <div className="flex items-center gap-3 flex-wrap pt-1">
          <span className="mono-label text-on-surface-variant">
            Gündəlik coin limiti:{' '}
            {dailyCoinLimit != null ? (
              <span className="text-on-surface font-medium">{formatCoinBalance(dailyCoinLimit)}</span>
            ) : (
              <span className="text-on-surface font-medium">standart</span>
            )}
          </span>
          <DailyCoinLimitControl userId={userId} dailyCoinLimit={dailyCoinLimit} onChanged={setDailyCoinLimit} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {statCards.map((c) => (
          <div key={c.label} className="glass-card rounded-2xl p-4">
            <div className="mono-label text-on-surface-variant uppercase">{c.label}</div>
            <div className="mt-2 text-2xl font-semibold text-on-surface" suppressHydrationWarning>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      {stats.topCitedDocuments.length > 0 && (
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-lg font-semibold mb-4">Ən çox istinad edilən sənədlər</h2>
          <div className="flex flex-wrap gap-2">
            {stats.topCitedDocuments.map((doc) => (
              <Chip key={doc.document_id} size="sm" variant="soft" color="accent" className="mono-label">
                {doc.title} · {doc.count}
              </Chip>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Söhbət tarixçəsi</h2>
          <span className="mono-label text-on-surface-variant">Cəmi {total}</span>
        </div>

        {conversations.length === 0 ? (
          <div className="glass-panel rounded-2xl">
            <EmptyState className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-on-surface-variant">
              Bu istifadəçinin hələ söhbəti yoxdur
            </EmptyState>
          </div>
        ) : (
          <div className="space-y-3">
            {conversations.map((c, i) => (
              <ConversationItem key={c.id} conversation={c} index={i} />
            ))}
          </div>
        )}

        {hasMore && (
          <div className="flex justify-center mt-4">
            <Button variant="outline" size="sm" isPending={loadingMore} onPress={loadMore}>
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner size="sm" tone="current" /> : null}
                  Daha çox göstər
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
