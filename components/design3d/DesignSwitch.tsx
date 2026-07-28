import type { ReactNode } from 'react';
import type { Design } from '@/lib/design/constants';

interface DesignSwitchProps {
  /**
   * Resolved server-side by the calling page via lib/design/getServerDesign
   * (reads the `yol-design` cookie) BEFORE either tree below is chosen — so
   * the correct tree is what the server sends on first paint. No client
   * hook, no swap-after-mount, no flash. Toggling designs (DesignToggle ->
   * useAppDesign.setDesign3D) writes the cookie and calls router.refresh(),
   * which re-runs the calling page and re-resolves this value.
   */
  design: Design;
  /** Existing, unmodified "sadə dizayn" tree. */
  simple: ReactNode;
  /** "Cyber-Circuit Legal" tree — the default for first-time visitors. */
  threeD: ReactNode;
}

export default function DesignSwitch({ design, simple, threeD }: DesignSwitchProps) {
  return <>{design === '3d' ? threeD : simple}</>;
}
