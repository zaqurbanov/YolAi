'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { TextField, Label, Input, TextArea, RadioGroup, Radio, Checkbox, Button, toast } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import { RULE_CATEGORIES } from '@/lib/content/ruleCategories';
import { createQuestionAction } from './actions';

const EMPTY_OPTIONS = ['', '', '', ''];

/**
 * Hand-authoring one exam question. Before this, the only way to add questions
 * was the PDF extractor, which produces LLM-drafted lesson questions — and
 * those are exactly what 0092 excluded from the exam. This is the entry point
 * for the exam pool.
 *
 * Creates a DRAFT. Images and publishing happen afterwards on the question's
 * own card (QuestionEditor), so a question can't reach a live exam half-typed
 * or without its illustration.
 */
export default function NewQuestionForm() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(EMPTY_OPTIONS);
  const [correctIndex, setCorrectIndex] = useState('0');
  const [category, setCategory] = useState(RULE_CATEGORIES[0]?.title ?? '');
  const [explanation, setExplanation] = useState('');
  const [isExam, setIsExam] = useState(true);
  const [isFineAmount, setIsFineAmount] = useState(false);
  const [isSaving, startSave] = useTransition();

  function reset() {
    setQuestion('');
    setOptions(EMPTY_OPTIONS);
    setCorrectIndex('0');
    setExplanation('');
    setIsFineAmount(false);
    setIsExam(true);
  }

  function handleCreate() {
    startSave(async () => {
      const result = await createQuestionAction({
        question,
        options,
        correctIndex: Number(correctIndex),
        category,
        explanation: explanation.trim() ? explanation : null,
        isExam,
        isFineAmount,
      });
      if (result.ok) {
        toast.success('Sual yaradıldı — şəkil əlavə edib dərc edin');
        reset();
        // The new draft appears in the list below, where images and publishing
        // live. Refresh rather than optimistically prepending: the list is
        // server-rendered and this keeps one source of truth.
        router.refresh();
      } else {
        toast.danger(result.error ?? 'Sualı yaratmaq uğursuz oldu');
      }
    });
  }

  if (!isOpen) {
    return (
      <Button variant="primary" onPress={() => setIsOpen(true)} className="gap-2 rounded-full glow-primary">
        + Yeni sual əlavə et
      </Button>
    );
  }

  return (
    <div className="glass-card space-y-4 rounded-2xl border-l-4 border-l-primary p-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[18px] font-semibold text-navy">Yeni sual</h3>
        <Button variant="ghost" size="sm" onPress={() => setIsOpen(false)}>
          Bağla
        </Button>
      </div>

      <TextField value={question} onChange={setQuestion}>
        <Label>Sual</Label>
        <TextArea rows={2} placeholder="Göstərilən vəziyyətdə hansı nəqliyyat vasitəsi üstünlüyə malikdir?" />
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
          {options.map((_, i) => (
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
        <label className="mb-1.5 block text-label-sm text-on-surface" htmlFor="new-question-category">
          Kateqoriya
        </label>
        <select
          id="new-question-category"
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

      <Checkbox isSelected={isExam} onChange={setIsExam}>
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          Rəsmi İmtahan sualı
        </Checkbox.Content>
      </Checkbox>

      <Checkbox isSelected={isFineAmount} onChange={setIsFineAmount}>
        <Checkbox.Content>
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          Cərimə məbləği sualı
        </Checkbox.Content>
      </Checkbox>

      <TextField value={explanation} onChange={setExplanation}>
        <Label>İzah (məcburi deyil)</Label>
        <TextArea rows={2} placeholder="Cavab niyə düzgündür..." />
      </TextField>

      <div className="flex items-center gap-2 border-t border-outline-variant/30 pt-4">
        <Button variant="primary" onPress={handleCreate} className="rounded-full glow-primary" isPending={isSaving}>
          {({ isPending }) => (
            <>
              {isPending ? <Spinner size="sm" tone="current" /> : null}
              Yarat
            </>
          )}
        </Button>
        <p className="text-legal-citation text-on-surface-variant">
          Layihə kimi yaranır — şəkli aşağıdakı kartdan əlavə edib dərc edin
        </p>
      </div>
    </div>
  );
}
