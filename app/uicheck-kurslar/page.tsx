'use client';

import { useEffect, useState } from 'react';
import { Button, NumberField } from '@heroui/react';
import CourseGroupProposalEditor from '@/app/admin/kurslar/CourseGroupProposalEditor';
import type { CourseGroupProposal } from '@/lib/lessons/groupTopicsIntoCourses';

function topic(i: number) {
  return {
    orderIndex: i,
    title: `Mövzu ${i + 1} — Yol nişanları və göstəricilər`,
    articleLabels: [`Maddə ${10 + i}`, `Maddə ${11 + i}`],
    chunkIds: [`c${i}`],
    charCount: 1200 + i * 40,
    preview: 'Yol hərəkəti qaydaları...',
  };
}

const proposal: CourseGroupProposal = {
  documentId: 'doc-1',
  documentTitle: 'Yol Hərəkəti Haqqında Qanun',
  source: 'deterministic',
  warning: undefined,
  groups: [
    {
      orderIndex: 0,
      title: 'Ümumi müddəalar',
      description: 'Əsas anlayışlar',
      startTopic: 0,
      endTopic: 3,
      topics: [topic(0), topic(1), topic(2), topic(3)],
      charCount: 5000,
    },
    {
      orderIndex: 1,
      title: 'Yol nişanları',
      description: null,
      startTopic: 4,
      endTopic: 6,
      topics: [topic(4), topic(5), topic(6)],
      charCount: 4000,
    },
  ],
};

export default function Harness() {
  const [groupCount, setGroupCount] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!window.location.search.includes('autosplit')) return;
    const t = setTimeout(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        '[aria-label^="Buradan yeni kurs başlat (Mövzu 3"]'
      );
      btn?.click();
    }, 600);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div className="glass-card rounded-2xl p-5">
        <div className="mt-4 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" className="rounded-full">
              Kursları təklif et (AI)
            </Button>
            <NumberField
              value={groupCount ?? Number.NaN}
              onChange={(v) =>
                setGroupCount(typeof v === 'number' && Number.isFinite(v) ? v : undefined)
              }
              minValue={1}
              step={1}
              aria-label="Kurs sayı (boş buraxsanız avtomatik seçilir)"
              className="w-[9.5rem] shrink-0"
            >
              <NumberField.Group>
                <NumberField.DecrementButton />
                <NumberField.Input className="w-full text-center" placeholder="avto" />
                <NumberField.IncrementButton />
              </NumberField.Group>
            </NumberField>
            <Button variant="tertiary" size="sm" className="rounded-full">
              AI-siz bərabər bölgü
            </Button>
          </div>
          <p className="text-[11px] leading-4 text-on-surface-variant">
            Soldakı xanaya neçə kurs istədiyinizi yazın. Boş qoysanız, kurs sayını proqram özü
            seçir. Bu say yalnız «AI-siz bərabər bölgü» üçün işləyir. [seçilmiş:{' '}
            {groupCount ?? 'avto'}]
          </p>
        </div>
      </div>

      <CourseGroupProposalEditor
        proposal={proposal}
        onCancel={() => {}}
        onCreated={() => {}}
      />
    </div>
  );
}
