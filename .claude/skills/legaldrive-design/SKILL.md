---
name: legaldrive-design
description: Design system and UI reference for YOL ("LegalDrive HUD"), sourced from the Google Stitch project. Load this before implementing or reviewing any page/component UI in app/ or components/ — it has the color tokens, typography, spacing, glass/HUD visual language, and the concrete markup patterns for the Home and Chat screens. designer and frontend agents should treat this as the design source of truth alongside (or ahead of) the Figma file until Figma is updated to match.
---

# LegalDrive HUD design system

Source: Google Stitch project `İnteraktiv Yol Bələdçisi` (project id `14236648175055410220`, MCP server `stitch`). Pull screens directly with `mcp__stitch__get_screen` / `get_project` using the IDs below if you need the live HTML/screenshot again — don't regenerate from memory.

## Screens converted

| Screen | Stitch screen ID | Device |
|---|---|---|
| Ana Səhifə - LegalDrive HUD (Home) | `03382b7645b14eb895d23424ae2db626` | Desktop |
| Ana Səhifə (Mobil) | `ba22a1c4b00f434e9011f4ce548e2958` | Mobile |
| Sual-Cavab Chat - LegalDrive HUD | `32135ce094dc4f7bbf2630607febba71` | Desktop |
| Sual-Cavab Chat (Mobil) | `b322069027de4cbfade3618a918d6724` | Mobile |

Two other screens in the same project (`Enhanced Dynamic Earth Animation`, `Advanced Traffic Signs Scene`) are Three.js-heavy variants — **not** in scope; see "What to drop" below.

## Brand & mood

Authoritative but frictionless — a legal-compliance app styled like a car HUD (heads-up display). Supports both dark and light themes (dark remains the default). Primary visual device is **glassmorphism**: translucent, blurred panels ("glass cards") floating over the background — a near-black asphalt background in dark mode, a soft light-gray canvas in light mode — occasionally paired with a 3D traffic-sign render in the source (see "What to drop").

## Design tokens

Both themes are implemented in `app/globals.css`. **Theme mechanism:** a single class on `<html>` controls everything — `html.dark` is the dark theme, `html:not(.dark)` (i.e. no `dark` class) is the light theme/default. A toggle only ever needs to add/remove the `dark` class on `<html>`; every token below flips off that one class. The Material-3-style `--color-*` tokens (`@theme inline` block) resolve via `var()` to the per-theme HeroUI primitives, so there's one source of truth per theme, not hardcoded duplicates.

**Palette update (current):** the brand moved from the Emergency-Blue/Caution-Yellow HUD palette to a warm, sage-green/earthy palette. The four brand colors are:
```
#778873   sage (deep)   — primary brand color: buttons, active states, focus rings, primary accents
#A1BC98   sage (light)  — primary-container / secondary accents, hover states
#DCCFC0   warm beige    — surface-container tone (card fills, dividers) — light mode leans on this heavily
#FDF6ED   warm ivory    — base background/surface in light mode
```
Use these as the anchor and derive the rest of the Material-3-style ramp (surface-container-low/high/highest, on-*, outline, etc.) by tinting/shading them rather than reusing the old blue-derived neutrals — the whole app (light **and** dark) should read as one warm, earthy family, not blue-neutrals with green buttons dropped on top. Dark mode keeps a dark, near-black/near-charcoal base (HUD mood is unchanged) but its primary/secondary/accent tokens should come from the same sage family (deepen/desaturate `#778873`/`#A1BC98` as needed for contrast on a dark surface) instead of Emergency Blue/Caution Yellow. `error`/`on-error`/`error-container` are not part of this palette swap — keep the existing red-family error tokens as-is (errors should stay visually distinct from the new success/brand greens).

**Colors — dark (`html.dark`)** (Tailwind `theme.extend.colors`, Material-3-style naming) — struct/roles below, exact hex values to be finalized by frontend/designer against the sage anchors above (keep the existing near-black surface ramp, replace the `primary`/`secondary`/`tertiary` family):
```
background / surface / surface-dim:        (unchanged near-black ramp — see app/globals.css)
surface-container-lowest / low / (base) / high / highest / bright: (unchanged near-black ramp)
on-surface / on-surface-variant / outline / outline-variant: (unchanged near-black ramp)

primary:             derive from #778873 (lightened/desaturated for legibility on a dark surface — sage replaces Emergency Blue)
on-primary:          dark, high-contrast text color against the derived primary
primary-container:   derive from #A1BC98
secondary:           a secondary sage/warm accent derived from #A1BC98 or #DCCFC0 (replaces Caution Yellow)
on-secondary / secondary-container: derived to keep Material-3 contrast pairing
tertiary:            derive from #DCCFC0 (muted/deepened for dark-surface legibility)
error / on-error / error-container: unchanged (keep existing red-family values)
```
Full token set (fixed/dim variants, inverse-*, etc.) is in the Stitch `designMd` — pull via `mcp__stitch__get_project` on `projects/14236648175055410220` if a token is missing here; treat the Stitch blue/yellow values there as superseded by this palette update for `primary`/`secondary`/`tertiary`.

**Colors — light (`html:not(.dark)`):** built directly from the four brand colors:
```
background / surface-dim:  #FDF6ED
surface (container):       #FDF6ED or a near-white tint of it (keep warm, don't drift to cool white)
surface-container-lowest:  lightest tint toward pure white while staying warm
surface-container-low:     #FDF6ED-to-#DCCFC0 light tint
surface-container:         #DCCFC0
surface-container-high:    a deeper tint of #DCCFC0
surface-container-highest: deeper still
surface-bright:            near #FDF6ED, brightest card surface
on-surface:                dark, warm-neutral (near-black with a warm undertone, not cool gray) for text legibility on #FDF6ED/#DCCFC0
on-surface-variant:        muted warm-neutral
outline / outline-variant: warm-neutral grays derived from the beige, not the old cool grays

primary:            #778873   (deep sage — legible as text/fill on the cream/beige surfaces)
on-primary:          #FDF6ED  (ivory text/icon on sage buttons)
primary-container:   #A1BC98  (light sage — secondary emphasis surfaces, hover fills)
secondary:           derive a second accent from #A1BC98/#DCCFC0 (replaces the old amber secondary — keep it distinguishable from primary at a glance, e.g. shift warmer/more beige-forward)
on-secondary / secondary-container: derived to keep Material-3 contrast pairing
tertiary:            derive from #DCCFC0, deepened for text-weight use
error:                unchanged (keep existing red-family error values — don't let error read as "just another green")
on-error / error-container: unchanged
```
HeroUI primitives follow the same light/dark split in `app/globals.css` (`--success`/`--success-foreground` etc. included) — treat that file as the source of truth for exact values once implemented; this table covers the Material-3-named subset. **Implementation note:** exact intermediate hex values (the surface-container ramp, on-* pairs, secondary/tertiary derivations) are deliberately left as "derive from X" rather than hardcoded here — the frontend/designer agent implementing this should generate the full ramp (e.g. via consistent lightness/saturation steps from the four anchor colors) directly in `app/globals.css`, verify contrast (text-on-surface, text-on-primary) meets reasonable legibility, and then backfill the concrete hex values into this table so it stays the single source of truth.

**Typography:**
- Headings/display: **Montserrat** (600–800) — `display-lg` 48px/56px (32px/40px mobile), `headline-md` 24px/32px 600.
- Body/UI: **Inter** (400–600) — `body-lg` 18px/28px, `body-md` 16px/24px, `label-bold` 14px/20px 600 tracked, `mono-label` 12px/16px 500 (used for citations/article numbers, timestamps — fits this app's citation-heavy chat).
- Load both via `next/font/google` in `app/layout.tsx`, not a CDN `<link>` (the Stitch HTML uses a CDN link — don't copy that into the real app).

**Radii:** default 8px; primary containers/cards 16–24px (`rounded-2xl`/`rounded-3xl`); pills for chips/badges `rounded-full`.

**Spacing:** 8px base unit; desktop margin 2rem, mobile margin 1rem, section gaps ~2.5rem+.

**Icons:** Material Symbols Outlined (variable font, `FILL`/`wght`/`GRAD`/`opsz` axes). Load via Google Fonts link or self-host — this app has no icon package installed yet (`package.json` has none). Alternative: swap for an installed React icon set if the frontend agent prefers, but keep the outlined/rounded style, don't mix in a sharp/solid icon set.

## Elevation model — "glass, not shadow"

**Palette-swap note:** the `.glow-primary` / ambient-glow rgba values below (`rgba(59,130,246,...)`) are the old Emergency-Blue glow — update these to the new sage `primary` (`#778873` family) when implementing the palette swap, so buttons/active elements glow sage instead of blue in both themes.

**Dark (`html.dark .glass-card` / `.glass-panel`):**
```css
background: rgba(30, 41, 59, 0.6);
backdrop-filter: blur(20px); /* blur(24px) for .glass-panel */
border: 1px solid rgba(255, 255, 255, 0.1);
box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.05); /* top hairline glow */
```
- A 1px top hairline gradient (`inset 0 1px 0 0 rgba(255,255,255,0.05)`) simulates light catching the top edge of glass.
- Primary buttons/active elements get an **ambient glow** instead of a drop shadow: `.glow-primary` → `box-shadow: 0 0 20px rgba(59,130,246,0.4)` in the primary blue.

**Light (`html:not(.dark) .glass-card` / `.glass-panel`):** don't just lighten the dark navy value uniformly — it reads muddy on white. Instead:
```css
background: rgba(255, 255, 255, 0.7);
backdrop-filter: blur(20px); /* blur(24px) for .glass-panel */
border: 1px solid rgba(0, 0, 0, 0.1);
box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06); /* soft drop shadow instead of a top hairline */
```
- The border does more of the edge-definition work in light mode (`rgba(0,0,0,0.1)` vs dark's `rgba(255,255,255,0.1)`), since a white top-hairline inset glow is invisible on a light background.
- A soft ambient drop shadow (`0 4px 20px rgba(0,0,0,0.06)`) stands in for the dark theme's inner top-hairline glow.
- `.glow-primary` in light mode is dimmed to `box-shadow: 0 0 16px rgba(59,130,246,0.22)` — a full-strength blue glow reads garish on white.
- Both themes keep `backdrop-filter: blur(20px)`/`blur(24px)` — that part is theme-agnostic.
- All of the above lives directly in `app/globals.css` as theme-scoped rules (Tailwind v4 has no `tailwind.config` in the v3 sense; tokens/utilities live in `@theme`/plain CSS there).

## Layout patterns (reusable across Home + Chat)

**App shell:**
- Fixed top header, `h-16`, `bg-surface/60 backdrop-blur-xl border-b border-white/10`: logo/wordmark left, nav or search center, notification/help icons + avatar right.
- Fixed left sidebar (`lg:` breakpoint, `w-64`, `bg-surface-container/60 backdrop-blur-2xl border-r border-white/10`): brand lockup, nav items (Home/Chat/Rules/Settings — Rules/Settings aren't real routes yet per `CLAUDE.md`, treat as future/disabled unless the user asks to wire them), a primary "New Consultation" CTA pinned at the bottom of the sidebar.
- Active nav item: `bg-primary/20 text-primary border-l-4 border-primary`.

**Home page** (map to `app/page.tsx` or a new marketing route — confirm with frontend agent given current `app/page.tsx` is still Create-Next-App boilerplate):
1. Hero: large Montserrat headline + primary/secondary CTA buttons, glass "progress" card floating bottom-right (skip on mobile).
2. "Əsas Kateqoriyalar" — 3-card grid (Nişanlar/Qaydalar/Cərimələr), each a `glass-card` with icon chip, title, description, footer citation tag (`Article NN | ...` in `mono-label`) — this citation-chip pattern should reuse whatever component the chat's citation rendering ends up using, don't fork it.
3. AI promo split section: image/visual left, copy + checklist + CTA right, tinted `bg-primary/5 border-primary/20` glass wrapper.
4. Footer: wordmark, legal links, two circular glass icon buttons.

**Chat page** (`app/chat/page.tsx`, already wired to `useChat`/`app/api/chat/route.ts` — this is a **visual restyle**, not a new chat implementation):
- Header bar above the message list: assistant avatar w/ status dot, conversation title + "Traffic Rules Expert" badge, share/more icons.
- Optional left "Recent Inquiries" rail (`w-80`) — only if/when conversation history across sessions exists; if `messages`/`conversations` schema doesn't support listing past conversations yet, treat this as a stretch element, not a blocker for the restyle.
- Message list: AI messages left-aligned in a `glass-panel` bubble (`rounded-2xl rounded-tl-none`, blue left border accent), user messages right-aligned in solid `bg-primary` bubble (`rounded-2xl rounded-tr-none`, ambient glow). Timestamp/sender label below each bubble in `mono-label`, uppercase.
- AI messages can embed a "rule card" (icon/image + short explainer + bullet list + citation chips) — map this to the real `messages.citations` jsonb data (per `CLAUDE.md`, citations come from actual retrieval results, never parsed from model text), not static demo content.
- Input bar: bottom-pinned `glass-panel`, attachment icon, text input, mic icon (optional/decorative unless voice input is in scope), send button with ambient glow, focus ring `ring-primary/50`.

## What to drop from the raw Stitch export

- The Three.js hero/background scenes (`STITCH_THREEJS_START/END` blocks) — decorative, heavy, not worth the dependency for a legal-reference chat app. Replace with a static gradient/glow or a lightweight CSS animation if the hero needs motion.
- The Tailwind CDN `<script>` and Google Fonts `<link>` tags — this app already has Tailwind v4 + `next/font` wired up.
- Inline `<script>` DOM manipulation (progress bar animation, fake message injection, scroll-to-bottom) — reimplement as React state/effects, not vanilla DOM scripts.
- Demo/placeholder copy and images — replace with real content or clearly-marked placeholders.

## Implementation notes for designer/frontend agents

- Check `mcp__heroui-react__list_components` first for chat bubble, input, card, and badge primitives before hand-rolling the markup above — HeroUI v3 compound components should back this, the Stitch HTML is a visual reference, not a literal DOM to copy.
- Keep `lib/`-side chat logic (streaming, `useChat`, citations) untouched — this skill is presentation-layer only.
- Verify visually with Playwright (`browser_navigate`/`browser_snapshot`/`browser_take_screenshot`) against the Stitch screenshots (`mcp__stitch__get_screen` returns a `screenshot.downloadUrl`) after implementing.
