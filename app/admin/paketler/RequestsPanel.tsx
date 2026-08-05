'use client';

import { useState, useTransition } from 'react';
import { Button, Chip } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import type { BillingRequest, RequestStatus } from '@/lib/billing/requests';
import { deleteRequestAction, listRequestsAction, setRequestStatusAction } from './actions';

const STATUS_LABEL: Record<RequestStatus, string> = {
  new: 'Yeni',
  contacted: 'Əlaqə saxlanılıb',
  done: 'Tamamlanıb',
  rejected: 'İmtina',
};

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('az-AZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

// Incoming "contact me about this plan" submissions from /qiymetler. The queue
// the owner works through while there is no online payment: call the number,
// take payment however, then grant the subscription in the panel above.
export default function RequestsPanel({ initial }: { initial: BillingRequest[] }) {
  const [requests, setRequests] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, startRefresh] = useTransition();

  function refresh() {
    startRefresh(async () => {
      const result = await listRequestsAction();
      if (result.ok) setRequests(result.data);
      else setError(result.error);
    });
  }

  async function handleStatus(id: string, status: RequestStatus) {
    setError(null);
    const result = await setRequestStatusAction(id, status);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    refresh();
  }

  async function handleDelete(request: BillingRequest) {
    if (!window.confirm(`${request.email} müraciəti silinsin?`)) return;
    setError(null);
    const result = await deleteRequestAction(request.id);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setRequests((prev) => prev.filter((r) => r.id !== request.id));
  }

  const newCount = requests.filter((r) => r.status === 'new').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-[20px] font-semibold text-navy">Müraciətlər</h2>
          {newCount > 0 && (
            <Chip size="sm" variant="soft" color="warning" className="text-[11px] font-medium tracking-normal">
              {newCount} yeni
            </Chip>
          )}
        </div>
        {isRefreshing && <Spinner size="sm" tone="current" />}
      </div>

      <p className="max-w-2xl text-label-sm text-on-surface-variant">
        /qiymetler səhifəsindən gələn müraciətlər. Nömrə ilə əlaqə saxlayın, ödənişi alın, sonra
        yuxarıdakı «Əl ilə abunə ver» ilə abunəni aktivləşdirin.
      </p>

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {requests.length === 0 ? (
        <div className="glass-panel rounded-2xl px-4 py-10 text-center text-sm text-on-surface-variant">
          Hələ müraciət yoxdur.
        </div>
      ) : (
        <ul className="space-y-2">
          {requests.map((request) => (
            <li key={request.id} className="glass-card rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Clickable: the whole point of this row is to contact them. */}
                    <a
                      href={`mailto:${request.email}`}
                      className="text-[14px] font-medium text-navy underline-offset-2 hover:underline"
                    >
                      {request.email}
                    </a>
                    <a
                      href={`tel:${request.phone}`}
                      className="text-[14px] font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {request.phone}
                    </a>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={
                        request.status === 'new'
                          ? 'warning'
                          : request.status === 'done'
                            ? 'success'
                            : 'default'
                      }
                      className="text-[11px] font-medium tracking-normal"
                    >
                      {STATUS_LABEL[request.status]}
                    </Chip>
                  </div>
                  <p className="mt-1 text-[12px] text-on-surface-variant">
                    {request.packageName} · {formatDateTime(request.createdAt)}
                    {request.userId ? ' · qeydiyyatlı istifadəçi' : ' · qonaq'}
                  </p>
                  {request.note && (
                    <p className="mt-1.5 text-[13px] text-on-surface">{request.note}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {request.status === 'new' && (
                    <Button
                      variant="tertiary"
                      size="sm"
                      className="rounded-full"
                      onPress={() => void handleStatus(request.id, 'contacted')}
                    >
                      Əlaqə saxlandı
                    </Button>
                  )}
                  {request.status !== 'done' && (
                    <Button
                      variant="tertiary"
                      size="sm"
                      className="rounded-full"
                      onPress={() => void handleStatus(request.id, 'done')}
                    >
                      Tamamlandı
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onPress={() => void handleDelete(request)}>
                    Sil
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
