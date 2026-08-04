'use client';

import { useRef, useState } from 'react';
import { Button, Chip, Input, Label, Switch, TextArea, TextField } from '@heroui/react';
import { Spinner } from '@/components/Spinner';
import type { CourseGroupProposal } from '@/lib/lessons/groupTopicsIntoCourses';
import type {
  CourseWithTopicsInput,
  CreatedCourseWithTopics,
  FailedCourseCreation,
} from '@/lib/lessons/courses';
import { createCoursesWithTopicsAction } from './actions';

interface CourseGroupProposalEditorProps {
  proposal: CourseGroupProposal;
  onCancel: () => void;
  onCreated: (result: {
    created: CreatedCourseWithTopics[];
    failed: FailedCourseCreation[];
  }) => void;
}

interface DraftTopic {
  /** Stable across group moves/deletes so React keys never collide. */
  key: string;
  title: string;
  articleLabels: string[];
  chunkIds: string[];
  charCount: number;
  preview: string;
}

interface DraftGroup {
  key: string;
  title: string;
  description: string;
  isFree: boolean;
  /** Kept as the raw string so "" can mean "global default" (null). */
  unlockPrice: string;
  topics: DraftTopic[];
}

// The whole grouping is local state until «Kurslar yarat»: proposeCourseGroups
// writes nothing, so every edit here is free and the admin can back out.
//
// Nothing carries an orderIndex. Both the course order and each course's topic
// order are read from array position at submit time, exactly like
// TopicProposalEditor — reordering or deleting therefore cannot leave a gap or
// a duplicate. The proposal's own startTopic/endTopic are informative only and
// are deliberately not shown: once a topic is moved between groups they no
// longer describe anything the admin can act on.
export default function CourseGroupProposalEditor({
  proposal,
  onCancel,
  onCreated,
}: CourseGroupProposalEditorProps) {
  const [groups, setGroups] = useState<DraftGroup[]>(() =>
    proposal.groups.map((g) => ({
      key: `g${g.orderIndex}-${g.startTopic}`,
      title: g.title,
      description: g.description ?? '',
      isFree: false,
      unlockPrice: '',
      topics: g.topics.map((t) => ({
        key: `t${t.orderIndex}-${t.chunkIds[0] ?? t.orderIndex}`,
        title: t.title,
        articleLabels: t.articleLabels,
        chunkIds: t.chunkIds,
        charCount: t.charCount,
        preview: t.preview,
      })),
    }))
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Split-created groups need a key that can never collide with a live one. A
  // topic-derived key can: split at topic X, move X back into the previous
  // group, split at X again — two groups would claim the same key.
  const splitSeq = useRef(0);

  function patchGroup(index: number, patch: Partial<DraftGroup>) {
    setGroups((prev) => prev.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }

  function moveGroup(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= groups.length) return;
    setGroups((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  // Deleting a group must never delete a section of the document: its topics
  // are handed to a neighbour instead. The last remaining group can't be
  // deleted at all — there would be nowhere for its topics to go.
  function removeGroup(index: number) {
    setGroups((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((_, i) => i !== index);
      const orphans = prev[index].topics;
      const receiver = index > 0 ? index - 1 : 0;
      next[receiver] =
        index > 0
          ? { ...next[receiver], topics: [...next[receiver].topics, ...orphans] }
          : { ...next[receiver], topics: [...orphans, ...next[receiver].topics] };
      return next;
    });
  }

  // Topic moves are adjacent-group only. Topic order is document order, so a
  // topic leaving a group belongs at the touching edge of the neighbour: the
  // END of the previous group, the START of the next one. Repeated presses walk
  // a topic across several groups.
  function moveTopic(groupIndex: number, topicIndex: number, delta: -1 | 1) {
    const target = groupIndex + delta;
    if (target < 0 || target >= groups.length) return;
    setGroups((prev) => {
      const next = [...prev];
      const topic = next[groupIndex].topics[topicIndex];
      next[groupIndex] = {
        ...next[groupIndex],
        topics: next[groupIndex].topics.filter((_, i) => i !== topicIndex),
      };
      next[target] = {
        ...next[target],
        topics:
          delta === -1
            ? [...next[target].topics, topic]
            : [topic, ...next[target].topics],
      };
      return next;
    });
  }

  // ADDING A GROUP IS A SPLIT, NEVER AN EMPTY GROUP.
  //
  // The whole model is consecutive ranges with every topic in exactly one group
  // (see the header of lib/lessons/groupTopicsIntoCourses.ts). An "add empty
  // group" button would break that invariant on the first press — and an empty
  // group is already painted red and blocks submit. Splitting at a topic
  // boundary keeps both consecutiveness and total coverage by construction:
  // `topicIndex` onward leaves the source group and becomes a new group
  // inserted immediately after it. Nothing renumbers anything, because course
  // order is array position at submit time.
  function splitGroupAt(groupIndex: number, topicIndex: number) {
    // Splitting at topic 0 would empty the source group — the one case this
    // primitive must refuse. The control is not rendered there either.
    if (topicIndex <= 0) return;
    splitSeq.current += 1;
    const key = `split-${splitSeq.current}`;
    setGroups((prev) => {
      const source = prev[groupIndex];
      if (!source || topicIndex >= source.topics.length) return prev;
      const tail = source.topics.slice(topicIndex);
      const next = [...prev];
      next[groupIndex] = { ...source, topics: source.topics.slice(0, topicIndex) };
      next.splice(groupIndex + 1, 0, {
        key,
        // Same fallback chain as materialise() in groupTopicsIntoCourses.ts —
        // the first topic's title, then a positional placeholder.
        title: tail[0].title.trim() || `Bölmə ${groupIndex + 2}`,
        description: '',
        // Price fields start unset: a new course is not implicitly free and
        // not implicitly priced like the group it was cut out of.
        isFree: false,
        unlockPrice: '',
        topics: tail,
      });
      return next;
    });
  }

  function removeTopic(groupIndex: number, topicIndex: number) {
    setGroups((prev) =>
      prev.map((g, i) =>
        i === groupIndex ? { ...g, topics: g.topics.filter((_, t) => t !== topicIndex) } : g
      )
    );
  }

  function retitleTopic(groupIndex: number, topicIndex: number, title: string) {
    setGroups((prev) =>
      prev.map((g, i) =>
        i === groupIndex
          ? { ...g, topics: g.topics.map((t, ti) => (ti === topicIndex ? { ...t, title } : t)) }
          : g
      )
    );
  }

  async function handleCreate() {
    setError(null);

    if (groups.length === 0) {
      setError('Ən azı bir kurs qalmalıdır');
      return;
    }
    // The backend refuses both of these, so they are caught here first — a
    // rejected batch would otherwise discard the admin's whole edit session.
    const emptyTitle = groups.findIndex((g) => !g.title.trim());
    if (emptyTitle !== -1) {
      setError(`${emptyTitle + 1}-ci kursun adı boş ola bilməz`);
      return;
    }
    const emptyGroup = groups.findIndex((g) => g.topics.length === 0);
    if (emptyGroup !== -1) {
      setError(
        `«${groups[emptyGroup].title.trim()}» kursunda mövzu qalmayıb — mövzu köçürün və ya kursu silin`
      );
      return;
    }
    if (groups.some((g) => g.topics.some((t) => !t.title.trim()))) {
      setError('Bütün mövzuların adı olmalıdır');
      return;
    }

    const courses: CourseWithTopicsInput[] = [];
    for (const group of groups) {
      let price: number | null = null;
      const trimmed = group.unlockPrice.trim();
      if (!group.isFree && trimmed !== '') {
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < 0) {
          setError(`«${group.title.trim()}» kursunun qiyməti düzgün ədəd olmalıdır`);
          return;
        }
        price = parsed;
      }
      courses.push({
        title: group.title.trim(),
        description: group.description.trim() || null,
        isFree: group.isFree,
        unlockPrice: price,
        topics: group.topics.map((t) => ({ title: t.title.trim(), chunkIds: t.chunkIds })),
      });
    }

    setPending(true);
    try {
      const result = await createCoursesWithTopicsAction(proposal.documentId, courses);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated(result.data);
    } catch (e) {
      // A rejected server action (network drop, function timeout) resolves
      // nowhere near the !result.ok branch.
      setError(e instanceof Error ? e.message : 'Xəta baş verdi');
    } finally {
      setPending(false);
    }
  }

  const topicTotal = groups.reduce((sum, g) => sum + g.topics.length, 0);

  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-legal-citation flex flex-wrap items-center gap-2 text-navy">
            Təklif edilən kurslar
            <Chip
              size="sm"
              variant="soft"
              color={proposal.source === 'ai' ? 'accent' : 'default'}
              className="text-[11px] font-medium tracking-normal"
            >
              {proposal.source === 'ai' ? 'AI qruplaşdırması' : 'mexaniki bölgü'}
            </Chip>
          </div>
          <p className="mt-1 text-label-sm text-on-surface-variant">
            {proposal.documentTitle} — {groups.length} kurs, {topicTotal} mövzu. Kurs adını,
            qiymətini dəyişin, mövzuları qruplar arasında köçürün. «Kurslar yarat» düyməsinə qədər
            heç nə yadda saxlanmır.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" isDisabled={pending} onPress={onCancel}>
            İmtina
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="rounded-full"
            isPending={pending}
            isDisabled={pending}
            onPress={() => void handleCreate()}
          >
            {({ isPending }) => (
              <>
                {isPending ? <Spinner size="sm" tone="current" /> : null}
                {groups.length} kurs yarat
              </>
            )}
          </Button>
        </div>
      </div>

      {/* "AI failed, this is the mechanical split" is information the admin must
          not miss — it can also be set while source === 'ai' (repaired ranges,
          or a failure in the topic pass that fed this one). */}
      {proposal.warning && (
        <div className="mt-3 rounded-2xl border border-caution-orange/40 bg-caution-orange/10 px-3 py-2">
          <p className="text-legal-citation text-caution-orange">Diqqət</p>
          <p className="mt-1 break-words text-sm text-on-surface">{proposal.warning}</p>
        </div>
      )}

      {error && <p className="text-[11px] leading-4 mt-3 break-words text-danger">{error}</p>}

      <div className="mt-4 space-y-4">
        {groups.map((group, gi) => (
          <div
            key={group.key}
            className={`rounded-2xl border p-4 ${
              group.topics.length === 0
                ? 'border-danger/50 bg-danger/5'
                : 'border-outline-variant/40'
            }`}
          >
            {/* Wraps: the control cluster is `shrink-0`, so without a floor on
                the field it is the field that gets squeezed to nothing. */}
            <div className="flex flex-wrap items-start gap-2">
              <span className="mt-2.5 w-5 shrink-0 text-[11px] leading-4 text-on-surface-variant">
                {gi + 1}.
              </span>

              <TextField
                value={group.title}
                onChange={(v) => patchGroup(gi, { title: v })}
                className="min-w-[9rem] flex-1"
                aria-label={`Kurs ${gi + 1} adı`}
              >
                <Input placeholder="Kurs adı" />
              </TextField>

              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  aria-label="Kursu yuxarı daşı"
                  isDisabled={gi === 0}
                  onPress={() => moveGroup(gi, -1)}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  aria-label="Kursu aşağı daşı"
                  isDisabled={gi === groups.length - 1}
                  onPress={() => moveGroup(gi, 1)}
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  isIconOnly
                  aria-label="Kursu sil (mövzular qonşu kursa keçir)"
                  isDisabled={groups.length <= 1}
                  onPress={() => removeGroup(gi)}
                >
                  ✕
                </Button>
              </div>
            </div>

            <div className="mt-3 pl-7">
              <TextField
                value={group.description}
                onChange={(v) => patchGroup(gi, { description: v })}
                aria-label={`Kurs ${gi + 1} təsviri`}
              >
                <TextArea rows={2} placeholder="Təsvir (istəyə bağlı)" />
              </TextField>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pl-7">
              <Switch
                isSelected={group.isFree}
                onChange={(v) => patchGroup(gi, { isFree: v })}
              >
                Pulsuz kurs
              </Switch>

              <TextField
                value={group.unlockPrice}
                onChange={(v) => patchGroup(gi, { unlockPrice: v })}
                isDisabled={group.isFree}
                className="w-56"
              >
                <Label>Enerji qiyməti (boş = qlobal standart)</Label>
                <Input type="number" min={0} step={1} placeholder="standart" />
              </TextField>
            </div>

            <div className="mt-3 pl-7">
              <div className="text-[11px] leading-4 mb-2 text-on-surface-variant">
                {group.topics.length} mövzu ·{' '}
                {group.topics.reduce((sum, t) => sum + t.charCount, 0)} simvol
              </div>

              {group.topics.length === 0 ? (
                <p className="text-[11px] leading-4 text-danger">
                  Bu kursda mövzu yoxdur — kurs yaradıla bilməz. Mövzu köçürün və ya kursu silin.
                </p>
              ) : (
                <div className="divide-y divide-outline-variant/25 overflow-hidden rounded-2xl border border-outline-variant/30">
                  {group.topics.map((topic, ti) => (
                    <div key={topic.key} className="p-2.5">
                      <div className="flex flex-wrap items-start gap-2">
                        <span className="mt-2.5 w-5 shrink-0 text-[11px] leading-4 text-on-surface-variant">
                          {ti + 1}.
                        </span>

                        <TextField
                          value={topic.title}
                          onChange={(v) => retitleTopic(gi, ti, v)}
                          className="min-w-[9rem] flex-1"
                          aria-label={`Kurs ${gi + 1}, mövzu ${ti + 1} adı`}
                        >
                          <Input />
                        </TextField>

                        <div className="ml-auto flex shrink-0 items-center gap-0.5">
                          {/* Rendered only from the second topic on — the
                              first-topic case has no valid meaning, and a
                              permanently disabled button on every group's row 1
                              would be noise the admin has to decode. */}
                          {ti > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="px-2 text-[11px] leading-4"
                              aria-label={`Buradan yeni kurs başlat (${topic.title || `mövzu ${ti + 1}`})`}
                              onPress={() => splitGroupAt(gi, ti)}
                            >
                              Buradan yeni kurs
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            isIconOnly
                            aria-label="Əvvəlki kursa köçür"
                            isDisabled={gi === 0}
                            onPress={() => moveTopic(gi, ti, -1)}
                          >
                            ↑
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            isIconOnly
                            aria-label="Növbəti kursa köçür"
                            isDisabled={gi === groups.length - 1}
                            onPress={() => moveTopic(gi, ti, 1)}
                          >
                            ↓
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            isIconOnly
                            aria-label="Mövzunu sil"
                            onPress={() => removeTopic(gi, ti)}
                          >
                            ✕
                          </Button>
                        </div>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-7">
                        <Chip size="sm" variant="soft" color="default" className="text-[11px] font-medium tracking-normal">
                          {topic.charCount} simvol
                        </Chip>
                        {topic.articleLabels.slice(0, 5).map((label) => (
                          <Chip
                            key={label}
                            size="sm"
                            variant="soft"
                            color="accent"
                            className="text-[11px] font-medium tracking-normal"
                          >
                            {label}
                          </Chip>
                        ))}
                        {topic.articleLabels.length > 5 && (
                          <span className="text-[11px] leading-4 text-on-surface-variant">
                            +{topic.articleLabels.length - 5}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] leading-4 mt-4 text-on-surface-variant">
        ↑ / ↓ mövzunu qonşu kursa köçürür: ↑ əvvəlki kursun sonuna, ↓ növbəti kursun əvvəlinə.
        Kursu silsəniz, mövzuları qonşu kursa keçir — heç bir mövzu itmir. «Buradan yeni kurs»
        həmin mövzudan başlayaraq qalan mövzuları yeni kursa ayırır — kursları artırmaq üçün
        bundan istifadə edin.
      </p>
    </div>
  );
}
