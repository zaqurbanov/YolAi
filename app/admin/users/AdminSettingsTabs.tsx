'use client';

import { Children, useState, type ReactNode } from 'react';

interface Tab {
  id: string;
  label: string;
}

export default function AdminSettingsTabs({ tabs, children }: { tabs: Tab[]; children: ReactNode }) {
  const panels = Children.toArray(children);
  const [activeId, setActiveId] = useState(tabs[0]?.id ?? '');

  return (
    <div className="space-y-6">
      <nav aria-label="Admin bölmələri" className="sticky top-3 z-10 -mx-1 flex gap-2 overflow-x-auto rounded-2xl border border-border/40 bg-background/95 p-2 shadow-sm backdrop-blur">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveId(tab.id)}
            className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${
              activeId === tab.id ? 'bg-primary text-on-primary shadow-sm' : 'text-muted hover:bg-surface-hover hover:text-foreground'
            }`}
            aria-selected={activeId === tab.id}
            role="tab"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {panels.map((panel, index) => (
        <div key={tabs[index]?.id ?? index} hidden={tabs[index]?.id !== activeId} role="tabpanel">
          {panel}
        </div>
      ))}
    </div>
  );
}
