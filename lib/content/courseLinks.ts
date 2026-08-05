// Deep links into the lesson-course catalog, shared by server components that
// render links (the landing page, the dashboard).
//
// Deliberately NOT in lib/lessons/ — that module is `server-only` and drags the
// service-role client into whatever imports it. The landing page must stay free
// of that, so these plain URL constants live in the neutral lib/content/ tree
// alongside ruleCategories/categoryContent, which the landing already imports.

/** The road-signs course, seeded by scripts/seed-road-sign-course.mjs. Its id is
 *  not stable across a re-seed, so it is pinned here once and every UI surface
 *  that deep-links into it (the Nişanlar card/tile) points at this one constant. */
export const SIGNS_COURSE_HREF = '/oyrenme/55e89e48-7b04-46cc-ac1b-bdcaed9275aa';
