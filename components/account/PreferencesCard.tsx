'use client';

import { useState } from 'react';
import { Switch } from '@heroui/react';
import { SettingsIcon } from '@/components/icons';
import { useDarkMode } from '@/lib/theme/useDarkMode';

// Real: dark/light mode toggle shares lib/theme/useDarkMode.ts with
// components/ThemeToggle.tsx (the NavBar icon) — a single source of truth,
// so toggling either one updates both while both are mounted (NavBar is
// global, so it's visible on this page at the same time as this switch).
function DarkModeRow() {
  const { isDark, setDark } = useDarkMode();

  return (
    <Switch isSelected={isDark ?? false} onChange={setDark} aria-label="Tünd rejim">
      <Switch.Content className="flex w-full items-center justify-between py-3">
        <span className="flex flex-col text-left">
          <span className="text-body-md font-semibold text-on-surface">Tünd Rejim</span>
          <span className="text-label-sm text-on-surface-variant">Göz yorğunluğunu azaldın</span>
        </span>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}

// Mock data: bildiriş tərcihi profiles cədvəlində (və ya başqa heç bir cədvəldə)
// saxlanmır — real bildiriş sistemi yoxdur. Yalnız lokal UI state, heç bir
// server action-a bağlı deyil və səhifə yenilənəndə sıfırlanır. Stitch
// mockup-dakı "Bildirişlər" sətri ilə vizual paritet üçün saxlanılıb.
function NotificationsRow() {
  const [enabled, setEnabled] = useState(true);

  return (
    <Switch isSelected={enabled} onChange={setEnabled} aria-label="Bildirişlər">
      <Switch.Content className="flex w-full items-center justify-between py-3">
        <span className="flex flex-col text-left">
          <span className="text-body-md font-semibold text-on-surface">Bildirişlər</span>
          <span className="text-label-sm text-on-surface-variant">Yeni qaydalar haqqında xəbərlər</span>
        </span>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}

// Mock data: tətbiq hazırda yalnız Azərbaycan dilində işləyir — real
// dil-seçimi funksiyası yoxdur (i18n qatı hələ qurulmayıb). Deaktiv seçim
// qutusu yalnız Stitch mockup-dakı "Dil (Language)" sətri ilə vizual paritet
// üçün göstərilir.
function LanguageRow() {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex flex-col">
        <span className="text-body-md font-semibold text-on-surface">Dil (Language)</span>
        <span className="text-label-sm text-on-surface-variant">Interfeys dili seçimi</span>
      </div>
      <select
        disabled
        className="rounded-lg border border-outline-variant/40 bg-surface-secondary px-3 py-1.5 text-label-sm text-on-surface-variant outline-none disabled:cursor-not-allowed"
        defaultValue="az"
      >
        <option value="az">Azərbaycan dili</option>
      </select>
    </div>
  );
}

export default function PreferencesCard() {
  return (
    <div className="glass-card rounded-2xl p-6 space-y-1">
      <div className="mb-2 flex items-center gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-safety-yellow/15 text-safety-yellow">
          <SettingsIcon />
        </div>
        <h2 className="text-headline-md text-[18px]">Tərcihlər</h2>
      </div>
      <div className="divide-y divide-outline-variant/20">
        <DarkModeRow />
        <NotificationsRow />
        <LanguageRow />
      </div>
    </div>
  );
}
