/**
 * The three energy games, as data. Shared by the showcase on /coin-qazan and the
 * single dynamic route that renders them, so a slug, title or description can
 * never drift between the card and the page it opens.
 *
 * Deliberately one route (`/coin-qazan/[game]`) rather than three sibling
 * routes: this app is already well past Vercel Hobby's 12-serverless-function
 * cap (see CLAUDE.md), and every additional page costs one more function. A
 * single dynamic segment gives the same path-shaped URLs for one.
 */
export const GAME_SLUGS = ['xo', 'nisan-sureti', 'imtahan'] as const;

export type GameSlug = (typeof GAME_SLUGS)[number];

export interface GameMeta {
  slug: GameSlug;
  title: string;
  /** One line under the title on the game page. */
  tagline: string;
  /** Longer copy for the showcase card. */
  description: string;
  emoji: string;
  /** What it costs to play, in plain words. */
  cost: string;
  /** Accent class for the showcase card's spine and chip. */
  tone: string;
}

export const GAMES: Record<GameSlug, GameMeta> = {
  xo: {
    slug: 'xo',
    title: 'Yol XO',
    tagline: 'Kəsişmədə "Dayan" və ya "Keç" — kompüterə qarşı oyna.',
    description:
      'Kompüterə qarşı XO. Qalib gələndə enerji qazanırsan, hər oyun bir enerji aparır. Gün ərzində oynadıqca çətinlik artır.',
    emoji: '❌',
    cost: '1 enerji',
    tone: 'regulatory-blue',
  },
  'nisan-sureti': {
    slug: 'nisan-sureti',
    title: 'Nişan Sürəti',
    tagline: 'Nişanı tanı, vaxt bitməmiş cavabla.',
    description:
      'Yol nişanlarını vaxta qarşı tanı. Hər düzgün cavab enerji gətirir — nə qədər sürətli olsan, o qədər çox.',
    emoji: '🚸',
    cost: '1 enerji',
    tone: 'go-green',
  },
  imtahan: {
    slug: 'imtahan',
    title: 'Sınaq İmtahanı',
    tagline: '10 sual, 15 dəqiqə, real imtahan formatı.',
    description:
      'Bütün mövzulardan qarışıq 10 sual. Mükafat yoxdur — bu, özünü yoxlamaq üçündür, imtahana hazırlıq alətidir.',
    emoji: '🎓',
    cost: '1 enerji',
    tone: 'safety-yellow',
  },
};

export function isGameSlug(value: string): value is GameSlug {
  return (GAME_SLUGS as readonly string[]).includes(value);
}
