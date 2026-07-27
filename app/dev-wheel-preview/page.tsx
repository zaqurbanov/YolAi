'use client';

// TEMPORARY visual-verification harness for the Çarx (WheelGame) HUD
// restyle — NOT part of the task deliverable, deleted before wrap-up.
// coin-qazan/page.tsx redirects admin accounts away (no coin economy for
// admins), so this renders WheelGame directly with dummy prizes/status to
// screenshot both design systems without needing a non-admin test account.

import { useEffect } from 'react';
import WheelGame from '@/components/games/WheelGame';
import RoadShaderBackground from '@/components/design3d/RoadShaderBackground';

const DUMMY_PRIZES = [
  { value: 10, weight: 30 },
  { value: 20, weight: 20 },
  { value: 50, weight: 15 },
  { value: 5, weight: 20 },
  { value: 100, weight: 5 },
  { value: 15, weight: 10 },
];

export default function DevWheelPreview() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const design = params.get('design') === '3d' ? '3d' : 'simple';
    document.documentElement.setAttribute('data-design', design);
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <div className="relative min-h-screen p-8" style={{ background: 'var(--hud-bg-deep, #0c0f0f)' }}>
      <div className="fixed inset-0 -z-20" aria-hidden="true">
        <RoadShaderBackground className="absolute inset-0 h-full w-full" />
      </div>
      <div className="relative z-10 mx-auto max-w-2xl">
        <WheelGame prizes={DUMMY_PRIZES} initialStatus="available" />
      </div>
    </div>
  );
}
