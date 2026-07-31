'use client';

import { useState, useTransition } from 'react';
import { TextField, Label, Input, TextArea, RadioGroup, Radio, Checkbox, Description, Button, AlertDialog, toast } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { RULE_CATEGORIES } from '@/lib/content/ruleCategories';
import {
  updateQuestionAction,
  publishQuestionAction,
  deleteQuestionAction,
  uploadQuestionImageAction,
} from './actions';
import type { QuizQuestionRow } from '@/lib/admin/quizQuestions';

interface QuestionEditorProps {
  question: QuizQuestionRow;
  accent: 'draft' | 'published';
}

// The row carries the storage PATH; the bucket is public, so the browser can
// build the URL itself from the already-public Supabase URL rather than the
// server round-tripping a signed one. Matches the bucket created in
// 0090_exam_question_images.sql.
function publicExamImageUrl(path: string | null): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  return `${base}/storage/v1/object/public/exam-images/${path}`;
}

interface ImageSlotProps {
  label: string;
  url: string | null;
  isUploading: boolean;
  onPick: (file: File | undefined) => void;
  onClear: () => void;
}

function ImageSlot({ label, url, isUploading, onPick, onClear }: ImageSlotProps) {
  return (
    <div className="rounded-xl border border-dashed border-outline-variant/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-label-sm text-on-surface-variant">{label}</span>
        {url && (
          <button
            type="button"
            onClick={onClear}
            className="text-legal-citation text-danger hover:underline"
          >
            Sil
          </button>
        )}
      </div>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- Supabase public storage URL, admin-only preview, not next/image-eligible.
        <img src={url} alt="" className="mb-2 max-h-40 w-full rounded-lg object-contain" />
      ) : (
        <p className="mb-2 text-legal-citation text-on-surface-variant">Şəkil yoxdur</p>
      )}
      <label className="inline-flex cursor-pointer items-center gap-2 text-label-sm text-primary hover:underline">
        {isUploading ? <Spinner size="sm" /> : null}
        {isUploading ? 'Yüklənir...' : url ? 'Dəyiş' : 'Şəkil seç'}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          disabled={isUploading}
          onChange={(e) => {
            onPick(e.target.files?.[0]);
            // Reset so re-picking the same file still fires onChange.
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );
}

export default function QuestionEditor({ question, accent }: QuestionEditorProps) {
  const [questionText, setQuestionText] = useState(question.question);
  const [options, setOptions] = useState(question.options);
  const [correctIndex, setCorrectIndex] = useState(String(question.correctIndex));
  const [category, setCategory] = useState(question.category);
  const [explanation, setExplanation] = useState(question.explanation ?? '');
  const [isFineAmount, setIsFineAmount] = useState(question.isFineAmount);
  // Image state is the storage PATH (what gets persisted); previewUrls holds
  // the public URL purely for display, so the editor can show a freshly
  // uploaded image without a round trip through the server component.
  const [imagePath, setImagePath] = useState<string | null>(question.imagePath);
  const [optionImagePaths, setOptionImagePaths] = useState<(string | null)[]>(
    question.optionImagePaths ?? [null, null, null, null],
  );
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [isSaving, startSave] = useTransition();
  const [isPublishing, startPublish] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  if (deleted) return null;

  // Uploads immediately on file pick (so the admin sees the real image right
  // away) but only records the PATH in local state — the question row is not
  // written until "Yadda saxla". An upload whose save is then abandoned leaves
  // an unreferenced object in the bucket; acceptable, and the same slot is
  // overwritten on the next attempt rather than accumulating.
  async function handleImagePick(slot: 'question' | number, file: File | undefined) {
    if (!file) return;
    const slotKey = String(slot);
    setUploadingSlot(slotKey);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('questionId', question.id);
      formData.append('slot', slotKey);
      const result = await uploadQuestionImageAction(formData);
      if (!result.ok || !result.path) {
        toast.danger(result.error ?? 'Şəkli yükləmək uğursuz oldu');
        return;
      }
      if (result.url) setPreviewUrls((prev) => ({ ...prev, [slotKey]: result.url! }));
      if (slot === 'question') {
        setImagePath(result.path);
      } else {
        setOptionImagePaths((prev) => prev.map((p, i) => (i === slot ? result.path! : p)));
      }
      toast.success('Şəkil yükləndi — yadda saxlamağı unutmayın');
    } finally {
      setUploadingSlot(null);
    }
  }

  function clearImage(slot: 'question' | number) {
    const slotKey = String(slot);
    setPreviewUrls((prev) => {
      const next = { ...prev };
      delete next[slotKey];
      return next;
    });
    if (slot === 'question') setImagePath(null);
    else setOptionImagePaths((prev) => prev.map((p, i) => (i === slot ? null : p)));
  }

  function handleSave() {
    startSave(async () => {
      const result = await updateQuestionAction(question.id, {
        question: questionText,
        options,
        correctIndex: Number(correctIndex),
        category,
        explanation: explanation.trim() ? explanation : null,
        isFineAmount,
        imagePath,
        optionImagePaths,
      });
      if (result.ok) {
        toast.success('Sual yadda saxlanıldı');
      } else {
        toast.danger(result.error ?? 'Yadda saxlamaq uğursuz oldu');
      }
    });
  }

  function handlePublish() {
    startPublish(async () => {
      const result = await publishQuestionAction(question.id);
      if (result.ok) {
        toast.success('Sual dərc edildi');
      } else {
        toast.danger(result.error ?? 'Dərc etmək uğursuz oldu');
      }
    });
  }

  function handleDelete() {
    startDelete(async () => {
      const result = await deleteQuestionAction(question.id);
      if (result.ok) {
        toast.success('Sual silindi');
        setDeleted(true);
      } else {
        toast.danger(result.error ?? 'Silmək uğursuz oldu');
      }
      setConfirmDelete(false);
    });
  }

  return (
    <div
      className={`glass-card rounded-2xl border-l-4 p-6 space-y-4 ${
        accent === 'draft' ? 'border-l-caution-orange' : 'border-l-go-green'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`text-legal-citation rounded-full px-2.5 py-1 ${
            accent === 'draft' ? 'bg-caution-orange/15 text-caution-orange' : 'bg-go-green/15 text-go-green'
          }`}
        >
          {accent === 'draft' ? 'Layihə — baxış tələb olunur' : 'Dərc edilib'}
        </span>
        {isFineAmount && (
          <span className="text-legal-citation rounded-full bg-danger/15 px-2.5 py-1 text-danger">Cərimə</span>
        )}
        {question.sourceTitle && (
          <span className="mono-label text-on-surface-variant">Mənbə: {question.sourceTitle}</span>
        )}
      </div>

      <TextField value={questionText} onChange={setQuestionText}>
        <Label>Sual</Label>
        <TextArea rows={2} />
      </TextField>

      {/* Exam illustration (0090). Optional — a question with no image renders
          as a normal text question everywhere. */}
      <ImageSlot
        label="Sualın şəkli (məcburi deyil)"
        url={previewUrls.question ?? publicExamImageUrl(imagePath)}
        isUploading={uploadingSlot === 'question'}
        onPick={(file) => void handleImagePick('question', file)}
        onClear={() => clearImage('question')}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((opt, i) => (
          <div key={i} className="space-y-2">
            <TextField
              value={opt}
              onChange={(val) => setOptions((prev) => prev.map((o, idx) => (idx === i ? val : o)))}
            >
              <Label>Variant {i + 1}</Label>
              <Input />
            </TextField>
            {/* Per-answer image, for sign-recognition questions where the
                options are pictures. The text field above stays required —
                it is the accessible label and the fallback. */}
            <ImageSlot
              label={`Variant ${i + 1} şəkli`}
              url={previewUrls[String(i)] ?? publicExamImageUrl(optionImagePaths[i] ?? null)}
              isUploading={uploadingSlot === String(i)}
              onPick={(file) => void handleImagePick(i, file)}
              onClear={() => clearImage(i)}
            />
          </div>
        ))}
      </div>

      <div>
        <Label>Düzgün cavab</Label>
        <RadioGroup value={correctIndex} onChange={setCorrectIndex} orientation="horizontal" className="mt-1.5">
          {options.map((opt, i) => (
            <Radio key={i} value={String(i)}>
              <Radio.Content>
                <Radio.Control>
                  <Radio.Indicator />
                </Radio.Control>
                Variant {i + 1}
              </Radio.Content>
            </Radio>
          ))}
        </RadioGroup>
      </div>

      <div>
        <label className="mb-1.5 block text-label-sm text-on-surface" htmlFor={`category-${question.id}`}>
          Kateqoriya
        </label>
        <select
          id={`category-${question.id}`}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-lg border border-outline-variant/40 bg-surface-secondary px-3 py-2 text-sm text-on-surface outline-none"
        >
          {RULE_CATEGORIES.map((c) => (
            <option key={c.title} value={c.title}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      <Checkbox isSelected={isFineAmount} onChange={setIsFineAmount}>
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          Cərimə məbləği sualı
        </Checkbox.Content>
        <Description>Bu tip suallar hər testdə maksimum 2 ilə məhdudlaşdırılır</Description>
      </Checkbox>

      <TextField value={explanation} onChange={setExplanation}>
        <Label>İzah (məcburi deyil)</Label>
        <TextArea rows={2} placeholder="Cavab niyə düzgündür..." />
      </TextField>

      <div className="flex flex-wrap items-center gap-2 border-t border-outline-variant/30 pt-4">
        <Button variant="outline" onPress={handleSave} isPending={isSaving}>
          {({ isPending }) => (
            <>
              {isPending ? <Spinner size="sm" tone="current" /> : null}
              Yadda saxla
            </>
          )}
        </Button>
        {accent === 'draft' && (
          <Button variant="primary" onPress={handlePublish} isPending={isPublishing}>
            {({ isPending }) => (
              <>
                {isPending ? <Spinner size="sm" tone="current" /> : null}
                Dərc et
              </>
            )}
          </Button>
        )}
        <Button variant="danger" onPress={() => setConfirmDelete(true)} isDisabled={isDeleting} className="ml-auto">
          Sil
        </Button>
      </div>

      <AlertDialog.Root isOpen={confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(false)}>
        <AlertDialog.Backdrop>
          <AlertDialog.Container>
            <AlertDialog.Dialog>
              <AlertDialog.Icon status="danger" />
              <AlertDialog.Header>
                <AlertDialog.Heading>Sualı sil</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>Bu sualı silmək istədiyinizə əminsiniz?</AlertDialog.Body>
              <AlertDialog.Footer>
                <Button variant="outline" onPress={() => setConfirmDelete(false)} isDisabled={isDeleting}>
                  Ləğv et
                </Button>
                <Button variant="danger" onPress={handleDelete} isPending={isDeleting}>
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner size="sm" tone="current" /> : null}
                      Sil
                    </>
                  )}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog.Root>
    </div>
  );
}
