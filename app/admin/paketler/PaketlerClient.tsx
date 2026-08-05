'use client';

import { useState, useTransition } from 'react';
import { Button, Chip, Input, Label, Radio, RadioGroup, Switch, TextField } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import type { BillingPackage, PackageInput, PackageKind, PackageStatus } from '@/lib/billing/packages';
import {
  createPackageAction,
  deletePackageAction,
  listPackagesAction,
  updatePackageAction,
} from './actions';

interface PaketlerClientProps {
  initialPackages: BillingPackage[];
}

// Form state is a flat record of STRINGS: every field comes from a text input,
// and parsing happens once on submit. Keeping numbers as strings while editing
// is what lets the admin clear a field to empty without it snapping back to 0.
interface FormState {
  code: string;
  name: string;
  description: string;
  kind: PackageKind;
  price: string;
  currency: string;
  periodDays: string;
  coinDailyFloor: string;
  energyDailyFloor: string;
  coinAmount: string;
  energyAmount: string;
  adsDisabled: boolean;
  badgeLabel: string;
  provider: string;
  providerPriceId: string;
  status: PackageStatus;
  sortOrder: string;
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  description: '',
  kind: 'subscription',
  price: '',
  currency: 'AZN',
  periodDays: '30',
  coinDailyFloor: '',
  energyDailyFloor: '',
  coinAmount: '',
  energyAmount: '',
  adsDisabled: false,
  badgeLabel: '',
  provider: '',
  providerPriceId: '',
  status: 'draft',
  sortOrder: '0',
};

function toForm(pkg: BillingPackage): FormState {
  return {
    code: pkg.code,
    name: pkg.name,
    description: pkg.description ?? '',
    kind: pkg.kind,
    price: String(pkg.price),
    currency: pkg.currency,
    periodDays: pkg.periodDays != null ? String(pkg.periodDays) : '30',
    coinDailyFloor: pkg.coinDailyFloor != null ? String(pkg.coinDailyFloor) : '',
    energyDailyFloor: pkg.energyDailyFloor != null ? String(pkg.energyDailyFloor) : '',
    coinAmount: pkg.coinAmount != null ? String(pkg.coinAmount) : '',
    energyAmount: pkg.energyAmount != null ? String(pkg.energyAmount) : '',
    adsDisabled: pkg.adsDisabled,
    badgeLabel: pkg.badgeLabel ?? '',
    provider: pkg.provider ?? '',
    providerPriceId: pkg.providerPriceId ?? '',
    status: pkg.status,
    sortOrder: String(pkg.sortOrder),
  };
}

// '' -> null so an empty field clears the column, rather than writing 0 and
// silently turning "not offered" into "offered, amount zero".
function optionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInput(form: FormState): PackageInput {
  return {
    code: form.code,
    name: form.name,
    description: form.description,
    kind: form.kind,
    price: Number(form.price.trim()),
    currency: form.currency,
    periodDays: optionalNumber(form.periodDays),
    coinDailyFloor: optionalNumber(form.coinDailyFloor),
    energyDailyFloor: optionalNumber(form.energyDailyFloor),
    coinAmount: optionalNumber(form.coinAmount),
    energyAmount: optionalNumber(form.energyAmount),
    adsDisabled: form.adsDisabled,
    badgeLabel: form.badgeLabel,
    provider: form.provider,
    providerPriceId: form.providerPriceId,
    status: form.status,
    sortOrder: optionalNumber(form.sortOrder) ?? 0,
  };
}

const STATUS_LABEL: Record<PackageStatus, string> = {
  draft: 'Qaralama',
  active: 'Aktiv',
  archived: 'Arxiv',
};

export default function PaketlerClient({ initialPackages }: PaketlerClientProps) {
  const [packages, setPackages] = useState(initialPackages);
  const [error, setError] = useState<string | null>(null);
  // null = form closed; 'new' = creating; otherwise the id being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function refresh() {
    startRefresh(async () => {
      const result = await listPackagesAction();
      if (result.ok) setPackages(result.data);
      else setError(result.error);
    });
  }

  function openCreate() {
    setError(null);
    setForm(EMPTY_FORM);
    setEditing('new');
  }

  function openEdit(pkg: BillingPackage) {
    setError(null);
    setForm(toForm(pkg));
    setEditing(pkg.id);
  }

  async function handleSave() {
    if (saving || editing === null) return;

    const price = Number(form.price.trim());
    if (!Number.isFinite(price) || price < 0) {
      setError('Qiymət düzgün ədəd olmalıdır');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const input = toInput(form);
      const result =
        editing === 'new'
          ? await createPackageAction(input)
          : await updatePackageAction(editing, input);

      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xəta baş verdi');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(pkg: BillingPackage) {
    if (!window.confirm(`"${pkg.name}" paketi silinsin?`)) return;
    setError(null);
    try {
      const result = await deletePackageAction(pkg.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPackages((prev) => prev.filter((p) => p.id !== pkg.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Xəta baş verdi');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-label-sm text-on-surface-variant">
          Qiymətlər burada saxlanılır, kodda deyil — inflyasiyaya görə dəyişmək üçün deploy lazım
          deyil. Yalnız <strong>Aktiv</strong> paketlər istifadəçilərə görünür.
        </p>
        <div className="flex items-center gap-2">
          {isRefreshing && <Spinner size="sm" tone="current" />}
          {editing === null && (
            <Button variant="primary" size="sm" className="rounded-full" onPress={openCreate}>
              Yeni paket
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {editing !== null && (
        <div className="glass-card space-y-4 rounded-2xl p-5">
          <h2 className="text-[17px] font-semibold text-navy">
            {editing === 'new' ? 'Yeni paket' : 'Paketi redaktə et'}
          </h2>

          <RadioGroup
            aria-label="Paket növü"
            value={form.kind}
            onChange={(value) => set('kind', value as PackageKind)}
            isDisabled={saving}
            orientation="horizontal"
          >
            <Radio value="subscription">
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                Abunə
              </Radio.Content>
            </Radio>
            <Radio value="one_time">
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                Birdəfəlik
              </Radio.Content>
            </Radio>
          </RadioGroup>

          <div className="grid gap-3 sm:grid-cols-2">
            <TextField value={form.name} onChange={(v) => set('name', v)} isDisabled={saving}>
              <Label>Ad</Label>
              <Input placeholder="Pro abunə" />
            </TextField>

            <TextField value={form.code} onChange={(v) => set('code', v)} isDisabled={saving}>
              <Label>Kod (dəyişməz identifikator)</Label>
              <Input placeholder="pro-monthly" />
            </TextField>

            <TextField value={form.price} onChange={(v) => set('price', v)} isDisabled={saving}>
              <Label>Qiymət</Label>
              <Input type="number" min={0} step={0.01} placeholder="7.00" />
            </TextField>

            <TextField value={form.currency} onChange={(v) => set('currency', v)} isDisabled={saving}>
              <Label>Valyuta</Label>
              <Input placeholder="AZN" />
            </TextField>
          </div>

          <TextField
            value={form.description}
            onChange={(v) => set('description', v)}
            isDisabled={saving}
          >
            <Label>Təsvir (istifadəçiyə görünür)</Label>
            <Input placeholder="Gündə 15 coin, reklamsız" />
          </TextField>

          {form.kind === 'subscription' ? (
            <div className="space-y-3 rounded-2xl border border-outline-variant/40 p-4">
              <p className="text-label-sm text-on-surface-variant">
                Abunə <strong>gündəlik minimum miqdar</strong> verir, aylıq yığın yox: istifadəçinin
                balansı hər gün bu miqdardan azdırsa, avtomatik ona qədər qaldırılır. Pulsuz
                istifadəçidə coin 3, enerji 10-dur.
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <TextField
                  value={form.periodDays}
                  onChange={(v) => set('periodDays', v)}
                  isDisabled={saving}
                >
                  <Label>Müddət (gün)</Label>
                  <Input type="number" min={1} step={1} placeholder="30" />
                </TextField>
                <TextField
                  value={form.coinDailyFloor}
                  onChange={(v) => set('coinDailyFloor', v)}
                  isDisabled={saving}
                >
                  <Label>Gündəlik coin (minimum)</Label>
                  <Input type="number" min={0} step={0.01} placeholder="15" />
                </TextField>
                <TextField
                  value={form.energyDailyFloor}
                  onChange={(v) => set('energyDailyFloor', v)}
                  isDisabled={saving}
                >
                  <Label>Gündəlik enerji (minimum)</Label>
                  <Input type="number" min={0} step={1} placeholder="20" />
                </TextField>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 rounded-2xl border border-outline-variant/40 p-4 sm:grid-cols-2">
              <TextField
                value={form.coinAmount}
                onChange={(v) => set('coinAmount', v)}
                isDisabled={saving}
              >
                <Label>Coin miqdarı (birdəfəlik)</Label>
                <Input type="number" min={0} step={0.01} placeholder="100" />
              </TextField>
              <TextField
                value={form.energyAmount}
                onChange={(v) => set('energyAmount', v)}
                isDisabled={saving}
              >
                <Label>Enerji miqdarı (birdəfəlik)</Label>
                <Input type="number" min={0} step={1} placeholder="250" />
              </TextField>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <Switch
              isSelected={form.adsDisabled}
              onChange={(v) => set('adsDisabled', v)}
              isDisabled={saving}
            >
              Reklamsız
            </Switch>
            <TextField
              value={form.badgeLabel}
              onChange={(v) => set('badgeLabel', v)}
              isDisabled={saving}
              className="w-48"
            >
              <Label>Profil rozeti yazısı</Label>
              <Input placeholder="PRO" />
            </TextField>
            <TextField
              value={form.sortOrder}
              onChange={(v) => set('sortOrder', v)}
              isDisabled={saving}
              className="w-32"
            >
              <Label>Sıra</Label>
              <Input type="number" step={1} />
            </TextField>
          </div>

          {/* Provider mapping is intentionally free-text and optional: no payment
              provider is contracted yet, and a package must be creatable and
              priceable before it is sellable. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField value={form.provider} onChange={(v) => set('provider', v)} isDisabled={saving}>
              <Label>Provayder (boş = hələ satılmır)</Label>
              <Input placeholder="polar" />
            </TextField>
            <TextField
              value={form.providerPriceId}
              onChange={(v) => set('providerPriceId', v)}
              isDisabled={saving}
            >
              <Label>Provayderdəki qiymət id-si</Label>
              <Input placeholder="prod_..." />
            </TextField>
          </div>

          <RadioGroup
            aria-label="Status"
            value={form.status}
            onChange={(value) => set('status', value as PackageStatus)}
            isDisabled={saving}
            orientation="horizontal"
          >
            {(['draft', 'active', 'archived'] as const).map((s) => (
              <Radio key={s} value={s}>
                <Radio.Content>
                  <Radio.Control>
                    <Radio.Indicator />
                  </Radio.Control>
                  {STATUS_LABEL[s]}
                </Radio.Content>
              </Radio>
            ))}
          </RadioGroup>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              isPending={saving}
              isDisabled={saving}
              onPress={() => void handleSave()}
            >
              {({ isPending }) => (
                <>
                  {isPending ? <Spinner size="sm" tone="current" /> : null}
                  Yadda saxla
                </>
              )}
            </Button>
            <Button variant="ghost" size="sm" isDisabled={saving} onPress={() => setEditing(null)}>
              Ləğv et
            </Button>
          </div>
        </div>
      )}

      {packages.length === 0 ? (
        <div className="glass-panel rounded-2xl px-4 py-12 text-center text-sm text-on-surface-variant">
          Hələ paket yoxdur. «Yeni paket» ilə birincisini yarat.
        </div>
      ) : (
        <ul className="space-y-3">
          {packages.map((pkg) => (
            <li key={pkg.id} className="glass-card rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[16px] font-semibold text-navy">{pkg.name}</h3>
                    <Chip
                      size="sm"
                      variant="soft"
                      color={pkg.status === 'active' ? 'success' : 'default'}
                      className="text-[11px] font-medium tracking-normal"
                    >
                      {STATUS_LABEL[pkg.status]}
                    </Chip>
                    <Chip
                      size="sm"
                      variant="soft"
                      color="default"
                      className="text-[11px] font-medium tracking-normal"
                    >
                      {pkg.kind === 'subscription' ? 'Abunə' : 'Birdəfəlik'}
                    </Chip>
                    {!pkg.provider && (
                      <Chip
                        size="sm"
                        variant="soft"
                        color="warning"
                        className="text-[11px] font-medium tracking-normal"
                      >
                        Provayder yoxdur
                      </Chip>
                    )}
                  </div>
                  <p className="mt-1 text-[12px] text-on-surface-variant">
                    <code>{pkg.code}</code>
                    {pkg.description ? ` · ${pkg.description}` : ''}
                  </p>
                  <p className="mt-2 text-[13px] text-on-surface">
                    <strong>
                      {pkg.price} {pkg.currency}
                    </strong>
                    {pkg.kind === 'subscription'
                      ? ` / ${pkg.periodDays} gün · coin ${pkg.coinDailyFloor ?? 0}/gün · enerji ${pkg.energyDailyFloor ?? 0}/gün`
                      : ` · ${pkg.coinAmount ?? 0} coin · ${pkg.energyAmount ?? 0} enerji`}
                    {pkg.adsDisabled ? ' · reklamsız' : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="tertiary" size="sm" className="rounded-full" onPress={() => openEdit(pkg)}>
                    Redaktə
                  </Button>
                  <Button variant="ghost" size="sm" onPress={() => void handleDelete(pkg)}>
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
