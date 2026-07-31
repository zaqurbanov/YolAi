// Shared between lib/design/useAppDesign.ts (client, sets the cookie via
// document.cookie on toggle) and lib/design/getServerDesign.ts (server, reads
// it via next/headers' cookies()) — kept in a plain, import-side-effect-free
// module so the client hook never pulls in next/headers (server-only).
export const DESIGN_COOKIE_NAME = 'yol-design';

export type Design = 'simple' | '3d';

// Product decision (2026-07-31, supersedes the 2026-07-28 '3d' default):
// first-time visitors now see the "Ethereal" design — that is the `simple`
// design tree rendered in the LIGHT theme, whose palette was rebuilt from the
// Stitch "Ana Səhifə (Ethereal)" screen. The 3D "Cyber-Circuit Legal" design
// is still available from the navbar toggle; anyone who already chose it keeps
// seeing it via the cookie below.
//
// The matching theme default lives in THEME_AND_DESIGN_INIT_SCRIPT
// (app/layout.tsx): with no stored `yol-theme`, `simple` now resolves to LIGHT
// rather than dark, because Ethereal is a light-first design.
export const DEFAULT_DESIGN: Design = 'simple';
