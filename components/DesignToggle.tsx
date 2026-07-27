'use client';

import { ToggleButton } from '@heroui/react';
import { CubeIcon } from '@/components/icons';
import { useAppDesign } from '@/lib/design/useAppDesign';

// Second, independent toggle from ThemeToggle (dark/light within the existing
// design) — this one swaps the whole visual design system between "sadə
// dizayn" (existing LegalDrive HUD, default) and the new "Cyber-Circuit
// Legal" HUD. See lib/design/useAppDesign.ts for the persistence mechanism.
export default function DesignToggle() {
  const { is3D, setDesign3D } = useAppDesign();

  if (is3D === null) {
    // Same "avoid rendering a guessed state" posture as ThemeToggle.
    return <div className="size-9" aria-hidden="true" />;
  }

  return (
    <ToggleButton
      isSelected={is3D}
      onChange={setDesign3D}
      isIconOnly
      variant="ghost"
      aria-label={is3D ? 'Sadə dizayna qayıt' : 'Yeni dizayna keç'}
      className={
        'rounded-lg text-muted hover:bg-surface-hover hover:text-foreground' +
        (is3D ? ' text-primary' : '')
      }
    >
      <CubeIcon />
    </ToggleButton>
  );
}
