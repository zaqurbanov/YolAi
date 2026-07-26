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
      className="mono-label rounded-lg border border-outline-variant/40 bg-surface-container px-2.5 py-1.5 text-on-surface outline-none"
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
