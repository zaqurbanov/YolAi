// Shared between lib/design/useAppDesign.ts (client, sets the cookie via
// document.cookie on toggle) and lib/design/getServerDesign.ts (server, reads
// it via next/headers' cookies()) — kept in a plain, import-side-effect-free
// module so the client hook never pulls in next/headers (server-only).
export const DESIGN_COOKIE_NAME = 'yol-design';

export type Design = 'simple' | '3d';

// Product decision (2026-07-28): first-time visitors now see the newer
// "Cyber-Circuit Legal" 3D design by default. Anyone who already chose
// 'simple' keeps seeing it via the cookie below.
export const DEFAULT_DESIGN: Design = '3d';
