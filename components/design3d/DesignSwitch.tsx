'use client';

import type { ReactNode } from 'react';
import { useAppDesign } from '@/lib/design/useAppDesign';

interface DesignSwitchProps {
  /** Existing, unmodified "sadə dizayn" tree — also the SSR/first-paint default. */
  simple: ReactNode;
  /** New "Cyber-Circuit Legal" tree, shown once the client resolves the stored choice as 3D. */
  threeD: ReactNode;
}

// Chooses between two ALREADY-RENDERED element trees passed down from the
// server component (app/page.tsx) — it never re-fetches or re-derives data,
// it only decides which tree is mounted. Always renders `simple` until the
// client has resolved the real `data-design` attribute (mirrors
// ThemeToggle/useDarkMode's "undecided-until-mounted" pattern elsewhere in
// this app), so first paint on the server and first paint on the client
// always agree — no hydration mismatch, at the cost of one swap-after-mount
// frame for users who previously opted into the 3D design.
export default function DesignSwitch({ simple, threeD }: DesignSwitchProps) {
  const { is3D } = useAppDesign();
  return <>{is3D ? threeD : simple}</>;
}
