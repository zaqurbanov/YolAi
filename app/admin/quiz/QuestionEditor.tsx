'use client';

import { useState, useTransition } from 'react';
import { TextField, Label, Input, TextArea, RadioGroup, Radio, Button, AlertDialog, toast } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { RULE_CATEGORIES } from '@/lib/content/ruleCategories';
import { updateQuestionAction, publishQuestionAction, deleteQuestionAction } from './actions';
import type { QuizQuestionRow } from '@/lib/admin/quizQuestions';

interface QuestionEditorProps {
  question: QuizQuestionRow;
  accent: 'draft' | 'published';
}

export default function QuestionEditor({ question, accent }: QuestionEditorProps) {
  const [questionText, setQuestionText] = useState(question.question);
  const [options, setOptions] = useState(question.options);
  const [correctIndex, setCorrectIndex] = useState(String(question.correctIndex));
  const [category, setCategory] = useState(question.category);
  const [explanation, setExplanation] = useState(question.explanation ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [isSaving, startSave] = useTransition();
  const [isPublishing, startPublish] = useTransition();
  const [isDeleting, startDelete] = useTransition();

  if (deleted) return null;

  function handleSave() {
    startSave(async () => {
      const result = await updateQuestionAction(question.id, {
        question: questionText,
        options,
        correctIndex: Number(correctIndex),
        category,
        explanation: explanation.trim() ? explanation : null,
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
        {question.sourceTitle && (
          <span className="mono-label text-on-surface-variant">Mənbə: {question.sourceTitle}</span>
        )}
      </div>

      <TextField value={questionText} onChange={setQuestionText}>
        <Label>Sual</Label>
        <TextArea rows={2} />
      </TextField>

      <div className="grid gap-3 sm:grid-cols-2">
        {options.map((opt, i) => (
          <TextField
            key={i}
            value={opt}
            onChange={(val) => setOptions((prev) => prev.map((o, idx) => (idx === i ? val : o)))}
          >
            <Label>Variant {i + 1}</Label>
            <Input />
          </TextField>
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
