'use client';

// Small client island so the rest of LogsSection can stay a server component
// (it does two plain data reads and renders tables — no reason to ship the
// whole page as client JS just for one dropdown). Navigating with the
// `context` query param re-runs the server component with a filtered query,
// same pattern as any other App Router search-param filter.

import { useRouter, usePathname } from 'next/navigation';

interface ContextFilterProps {
  contexts: string[];
  current?: string;
}

export default function ContextFilter({ contexts, current }: ContextFilterProps) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <select
      value={current ?? ''}
      onChange={(e) => {
        const value = e.target.value;
        router.push(value ? `${pathname}?context=${encodeURIComponent(value)}` : pathname);
      }}
      className="rounded-full border border-border/40 bg-surface px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-navy outline-none focus:border-primary/60"
      aria-label="Yer üzrə filtr"
    >
      <option value="">Bütün yerlər</option>
      {contexts.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );
}
