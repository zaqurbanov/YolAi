import type { ComponentType, SVGProps } from 'react';
import {
  DocumentIcon,
  FineIcon,
  IntersectionIcon,
  ParkingIcon,
  RulesIcon,
  SignIcon,
  SpeedIcon,
  UserIcon,
} from '@/components/icons';

export interface RuleCategory {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  title: string;
  description: string;
  citation: string;
}

// Single source of truth for the traffic-rule category cards shown on both
// app/page.tsx (a 6-item subset) and app/oyrenme/page.tsx (all 8, as lesson
// cards with progress) — keeps title/description/citation wording in sync
// instead of drifting between two hand-maintained copies.
export const RULE_CATEGORIES: RuleCategory[] = [
  {
    icon: SignIcon,
    title: 'Nişanlar',
    description: 'Məlumatlandırıcı, xəbərdarlıq və qadağan nişanlarını nümunələrlə öyrənin.',
    citation: 'Maddə 18 | Yol nişanları',
  },
  {
    icon: RulesIcon,
    title: 'Qaydalar',
    description: 'Yol hərəkəti haqqında qanunvericiliyin əsas maddələri və tətbiqi qaydaları.',
    citation: 'Maddə 47 | Ümumi müddəalar',
  },
  {
    icon: FineIcon,
    title: 'Cərimələr və Bal Sistemi',
    description: 'Qayda pozuntularına görə tətbiq edilən cərimələr və bal sisteminin ətraflı izahı.',
    citation: 'İXM, Maddə 128 | Cərimə sanksiyaları',
  },
  {
    icon: UserIcon,
    title: 'Piyada Hərəkəti',
    description: 'Piyadaların keçidlərdən istifadə qaydaları və sürücülərin piyadalar qarşısında öhdəlikləri.',
    citation: 'Maddə 21 | Piyadaların hərəkəti',
  },
  {
    icon: IntersectionIcon,
    title: 'Kəsişmələr və Üstünlük Hüququ',
    description: 'Nizamlanmayan yolayrıcılarında və dairəvi hərəkətdə üstünlük hüququnun müəyyən edilməsi.',
    citation: 'Maddə 13 | Yolayrıcından keçmə qaydaları',
  },
  {
    icon: SpeedIcon,
    title: 'Sürət Həddi',
    description: 'Yaşayış massivlərində, magistrallarda və şəhərdaxili yollarda icazə verilən hərəkət sürəti.',
    citation: 'Maddə 63 | Hərəkət sürəti',
  },
  {
    icon: DocumentIcon,
    title: 'Sənədlər və Sığorta',
    description: 'Sürücülük vəsiqəsi, texniki pasport və icbari sığorta ilə bağlı tələb olunan sənədlər.',
    citation: 'İXM, Maddə 129 | Zəruri sənədlərin olmaması',
  },
  {
    icon: ParkingIcon,
    title: 'Dayanma və Dayanacaq Qaydaları',
    description: 'Nəqliyyat vasitələrinin dayandırılması və saxlanmasına dair qadağalar və icazə şərtləri.',
    citation: 'Maddə 74 | Dayanma və saxlanma qaydaları',
  },
];

// Hardcoded category-title <-> URL-slug map for /oyrenme/[slug] routing.
// Categories are static (this file is their single source of truth), so a
// generic slugify utility would be overkill — this map is the whole
// contract between lib/quiz/lessons.ts (reads) and the /oyrenme frontend
// (routing), documented here rather than re-derived per callsite.
const CATEGORY_SLUGS: Record<string, string> = {
  'Nişanlar': 'nisanlar',
  'Qaydalar': 'qaydalar',
  'Cərimələr və Bal Sistemi': 'cerimeler-ve-bal-sistemi',
  'Piyada Hərəkəti': 'piyada-hereketi',
  'Kəsişmələr və Üstünlük Hüququ': 'kesismeler-ve-ustunluk-hququ',
  'Sürət Həddi': 'suret-heddi',
  'Sənədlər və Sığorta': 'senedler-ve-sigorta',
  'Dayanma və Dayanacaq Qaydaları': 'dayanma-ve-dayanacaq-qaydalari',
};

const SLUGS_TO_CATEGORY: Record<string, string> = Object.fromEntries(
  Object.entries(CATEGORY_SLUGS).map(([title, slug]) => [slug, title])
);

export function categoryToSlug(title: string): string {
  return CATEGORY_SLUGS[title] ?? title;
}

export function slugToCategory(slug: string): string | undefined {
  return SLUGS_TO_CATEGORY[slug];
}
