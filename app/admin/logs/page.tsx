import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createClient } from '@/lib/supabase/server';

interface LogRow {
  id: string;
  request_id: string | null;
  query: string | null;
  rewrite_ms: number | null;
  embed_ms: number | null;
  db_search_ms: number | null;
  llm_first_token_ms: number | null;
  llm_total_ms: number | null;
  model_used: string | null;
  created_at: string;
}

const STAGE_METRICS = [
  { key: 'rewrite_ms', label: 'Rewrite' },
  { key: 'embed_ms', label: 'Embed' },
  { key: 'db_search_ms', label: 'DB search' },
  { key: 'llm_total_ms', label: 'LLM total' },
] as const;

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function formatMs(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${Math.round(value)} ms`;
}

function truncate(text: string | null, max: number): string {
  if (!text) return '—';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const dateFormatter = new Intl.DateTimeFormat('az-AZ', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export default async function AdminLogsPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('chat_request_logs')
    .select(
      'id, request_id, query, rewrite_ms, embed_ms, db_search_ms, llm_first_token_ms, llm_total_ms, model_used, created_at'
    )
    .order('created_at', { ascending: false })
    .limit(100);

  const rows: LogRow[] = data ?? [];

  const stats = STAGE_METRICS.map(({ key, label }) => {
    const values = rows
      .map((r) => r[key] as number | null)
      .filter((v): v is number => v !== null && v !== undefined);
    return {
      key,
      label,
      avg: average(values),
      p95: percentile(values, 95),
    };
  });

  const maxAvg = Math.max(...stats.map((s) => s.avg ?? 0), 1);

  return (
    <div className="mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sorğu latensiyası</h1>
        <span className="mono-label text-on-surface-variant">Son {rows.length} sorğu</span>
      </div>

      {error && (
        <div className="glass-panel rounded-2xl px-4 py-3 text-error text-sm">
          Loqları yükləmək mümkün olmadı: {error.message}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.key} className="glass-card rounded-2xl p-4">
            <div className="mono-label text-on-surface-variant uppercase">{s.label}</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-on-surface">{formatMs(s.avg)}</span>
              <span className="mono-label text-on-surface-variant">orta</span>
            </div>
            <div className="mt-1 mono-label text-on-surface-variant">p95: {formatMs(s.p95)}</div>
          </div>
        ))}
      </div>

      <div className="glass-card rounded-2xl p-6">
        <h2 className="text-lg font-semibold mb-4">Orta mərhələ vaxtları</h2>
        <div className="space-y-3">
          {stats.map((s) => {
            const widthPct = s.avg ? Math.max(2, (s.avg / maxAvg) * 100) : 0;
            return (
              <div key={s.key} className="flex items-center gap-3">
                <span className="mono-label text-on-surface-variant w-24 shrink-0">{s.label}</span>
                <div className="flex-1 h-6 rounded-full bg-surface-container-high overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary glow-primary"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                <span className="mono-label text-on-surface w-16 shrink-0 text-right">
                  {formatMs(s.avg)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-3">Son sorğular</h2>
        <div className="glass-panel rounded-2xl overflow-hidden overflow-x-auto">
          {rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-on-surface-variant">Hələ qeyd yoxdur</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/40 text-left">
                  <th className="px-4 py-3 font-medium text-on-surface-variant">Sorğu</th>
                  <th className="px-4 py-3 font-medium text-on-surface-variant">Model</th>
                  <th className="px-4 py-3 font-medium text-on-surface-variant text-right">Rewrite</th>
                  <th className="px-4 py-3 font-medium text-on-surface-variant text-right">Embed</th>
                  <th className="px-4 py-3 font-medium text-on-surface-variant text-right">DB axtarış</th>
                  <th className="px-4 py-3 font-medium text-on-surface-variant text-right">
                    İlk token
                  </th>
                  <th className="px-4 py-3 font-medium text-on-surface-variant text-right">
                    LLM cəmi
                  </th>
                  <th className="px-4 py-3 font-medium text-on-surface-variant text-right">Tarix</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-outline-variant/20 last:border-b-0">
                    <td className="px-4 py-3 max-w-xs truncate" title={row.query ?? undefined}>
                      {truncate(row.query, 60)}
                    </td>
                    <td className="px-4 py-3 mono-label truncate max-w-[10rem]" title={row.model_used ?? undefined}>
                      {row.model_used ?? '—'}
                    </td>
                    <td className="px-4 py-3 mono-label text-right">{formatMs(row.rewrite_ms)}</td>
                    <td className="px-4 py-3 mono-label text-right">{formatMs(row.embed_ms)}</td>
                    <td className="px-4 py-3 mono-label text-right">{formatMs(row.db_search_ms)}</td>
                    <td className="px-4 py-3 mono-label text-right">
                      {formatMs(row.llm_first_token_ms)}
                    </td>
                    <td className="px-4 py-3 mono-label text-right">{formatMs(row.llm_total_ms)}</td>
                    <td className="px-4 py-3 mono-label text-right text-on-surface-variant">
                      {dateFormatter.format(new Date(row.created_at))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
