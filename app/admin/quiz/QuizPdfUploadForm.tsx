'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { TextField, Label, Alert, Button, toast } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { RULE_CATEGORIES } from '@/lib/content/ruleCategories';

// Unlike UploadForm.tsx (documents), this form doesn't keep its own
// client-side list of results — the freshly-created drafts are inserted
// straight into quiz_questions by the route, and app/admin/quiz/page.tsx
// (a server component) is the single source of truth for the draft/
// published lists below. router.refresh() re-fetches that server data in
// place (no full browser reload) so the new drafts appear inline right
// under this form for immediate review/editing, without this component
// having to duplicate list state that could drift from the real list.
export default function QuizPdfUploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, startTransition] = useTransition();

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);
    if (category) formData.append('category', category);

    try {
      const res = await fetch('/api/admin/quiz-questions', { method: 'POST', body: formData });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.error ?? `Yükləmə uğursuz oldu (${res.status})`);
      } else {
        const count = data?.questions?.length ?? 0;
        if (count === 0) {
          toast.danger('Sənəddən heç bir sual çıxarılmadı');
        } else {
          toast.success(`${count} sual layihəsi əlavə edildi`);
        }
        setFile(null);
        startTransition(() => router.refresh());
      }
    } catch {
      setError('Şəbəkə xətası: yükləmə tamamlanmadı');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="glass-card rounded-2xl p-6">
      <form onSubmit={handleUpload} className="flex flex-col gap-4">
        <div>
          <h2 className="text-headline-md text-[18px]">PDF-dən sual yarat</h2>
          <p className="mt-1 text-body-md text-on-surface-variant">
            Sənəd yükləyin — AI mətndən test sualları çıxaracaq. Bütün suallar dərc olunmadan əvvəl
            layihə statusunda saxlanılır və baxış tələb edir.
          </p>
        </div>

        <TextField isRequired>
          <Label>PDF fayl</Label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full border rounded-md px-3 py-2 text-sm"
            required
          />
        </TextField>

        <div>
          <label className="mb-1.5 block text-label-sm text-on-surface" htmlFor="quiz-category-hint">
            Kateqoriya (məlumat üçün, məcburi deyil)
          </label>
          <select
            id="quiz-category-hint"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-outline-variant/40 bg-surface-secondary px-3 py-2 text-sm text-on-surface outline-none"
          >
            <option value="">Seçilməyib</option>
            {RULE_CATEGORIES.map((c) => (
              <option key={c.title} value={c.title}>
                {c.title}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        <div>
          <Button
            type="submit"
            variant="primary"
            className="glow-primary"
            isPending={uploading || isRefreshing}
            isDisabled={!file}
          >
            {({ isPending }) => (
              <>
                {isPending ? <Spinner size="sm" tone="current" /> : null}
                Sualları yarat
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
