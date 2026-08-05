'use client';

import { useState, useTransition } from 'react';
import { Button, Chip, Input, Label, Radio, RadioGroup, TextField } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import type { BillingPackage } from '@/lib/billing/packages';
import type { SubscriptionListRow } from '@/lib/billing/subscriptions';
import {
  cancelSubscriptionAction,
  grantSubscriptionAction,
  listSubscriptionsAction,
} from './actions';

interface SubscriptionsPanelProps {
  /** Only subscription-kind, active packages can be granted. */
  packages: BillingPackage[];
  initialSubscriptions: SubscriptionListRow[];
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktiv',
  expired: 'Bitib',
  canceled: 'Ləğv edilib',
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('az-AZ', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

// Manual grant + the live subscription list. This is what makes the whole
// mechanic usable today: no payment provider is contracted yet, so the admin is
// the only "purchase path" that exists — and it stays useful afterwards for
// support cases and comps.
export default function SubscriptionsPanel({
  packages,
  initialSubscriptions,
}: SubscriptionsPanelProps) {
  const [subscriptions, setSubscriptions] = useState(initialSubscriptions);
  const [email, setEmail] = useState('');
  const [packageId, setPackageId] = useState(packages[0]?.id ?? '');
  const [days, setDays] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();

  function refresh() {
    startRefresh(async () => {
      const result = await listSubscriptionsAction();
      if (result.ok) setSubscriptions(result.data);
      else setError(result.error);
    });
  }

  async function handleGrant() {
    if (saving) return;
    setError(null);
    setNotice(null);

    if (!email.trim()) {
      setError('İstifadəçinin e-poçtunu yaz');
      return;
    }
    if (!packageId) {
      setError('Abunə paketi seç (aktiv abunə paketi olmalıdır)');
      return;
    }

    const trimmedDays = days.trim();
    const parsedDays = trimmedDays === '' ? null : Number(trimmedDays);
    if (parsedDays !== null && (!Number.isInteger(parsedDays) || parsedDays <= 0)) {
      setError('Müddət müsbət tam ədəd olmalıdır');
      return;
    }

    setSaving(true);
    try {
      const result = await grantSubscriptionAction(email.trim(), packageId, parsedDays);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNotice(`Abunə verildi — bitmə tarixi: ${formatDate(result.data.expiresAt)}`);
      setEmail('');
      setDays('');
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(row: SubscriptionListRow) {
    if (!window.confirm(`${row.email ?? row.userId} üçün abunə ləğv edilsin?`)) return;
    setError(null);
    setNotice(null);
    try {
      const result = await cancelSubscriptionAction(row.userId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xəta baş verdi');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[20px] font-semibold text-navy">Abunələr</h2>
        {isRefreshing && <Spinner size="sm" tone="current" />}
      </div>

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-2xl border border-go-green/40 bg-go-green/10 px-3 py-2 text-sm text-on-surface">
          {notice}
        </div>
      )}

      <div className="glass-card space-y-4 rounded-2xl p-5">
        <div>
          <h3 className="text-[16px] font-semibold text-navy">Əl ilə abunə ver</h3>
          <p className="mt-1 text-label-sm text-on-surface-variant">
            Ödəniş sistemi qoşulana qədər yeganə yol budur — və sonra da dəstək halları üçün
            qalacaq. Verilən abunə dərhal gündəlik coin və enerji miqdarını artırır.
          </p>
        </div>

        {packages.length === 0 ? (
          <p className="text-label-sm text-safety-yellow">
            Aktiv abunə paketi yoxdur. Əvvəlcə yuxarıda paket yarat və statusunu «Aktiv» et.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField value={email} onChange={setEmail} isDisabled={saving}>
                <Label>İstifadəçinin e-poçtu</Label>
                <Input type="email" placeholder="ad@example.com" />
              </TextField>
              <TextField value={days} onChange={setDays} isDisabled={saving}>
                <Label>Müddət (boş = paketin öz müddəti)</Label>
                <Input type="number" min={1} step={1} placeholder="30" />
              </TextField>
            </div>

            <RadioGroup
              aria-label="Paket"
              value={packageId}
              onChange={setPackageId}
              isDisabled={saving}
            >
              {packages.map((pkg) => (
                <Radio key={pkg.id} value={pkg.id}>
                  <Radio.Content>
                    <Radio.Control>
                      <Radio.Indicator />
                    </Radio.Control>
                    {pkg.name} — {pkg.price} {pkg.currency} / {pkg.periodDays} gün · coin{' '}
                    {pkg.coinDailyFloor ?? 0}/gün · enerji {pkg.energyDailyFloor ?? 0}/gün
                  </Radio.Content>
                </Radio>
              ))}
            </RadioGroup>

            <Button
              variant="primary"
              size="sm"
              isPending={saving}
              isDisabled={saving}
              onPress={() => void handleGrant()}
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner size="sm" tone="current" /> : null}
                  Abunə ver
                </>
              )}
            </Button>
          </>
        )}
      </div>

      {subscriptions.length === 0 ? (
        <div className="glass-panel rounded-2xl px-4 py-10 text-center text-sm text-on-surface-variant">
          Hələ abunə yoxdur.
        </div>
      ) : (
        <ul className="space-y-2">
          {subscriptions.map((row) => (
            <li
              key={row.id}
              className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-medium text-navy">{row.email ?? row.userId}</span>
                  <Chip
                    size="sm"
                    variant="soft"
                    color={row.status === 'active' ? 'success' : 'default'}
                    className="text-[11px] font-medium tracking-normal"
                  >
                    {STATUS_LABEL[row.status] ?? row.status}
                  </Chip>
                </div>
                <p className="mt-1 text-[12px] text-on-surface-variant">
                  {row.packageName} · {formatDate(row.startedAt)} — {formatDate(row.expiresAt)} ·{' '}
                  {row.source}
                </p>
              </div>
              {row.status === 'active' && (
                <Button variant="ghost" size="sm" onPress={() => void handleCancel(row)}>
                  Ləğv et
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
