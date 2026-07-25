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
  question: string;
}

// Single source of truth for the traffic-rule category cards shown on both
// app/page.tsx (a 6-item subset) and app/oyrenme/page.tsx (all 8, as lesson
// cards with progress) — keeps title/description/citation wording in sync
// instead of drifting between two hand-maintained copies. `question` is the
// natural-language chat prefill a card sends to /chat when clicked. Titles are
// fixed identifiers (admin overrides in app_settings key by them — see
// lib/content/categoryContent.ts); description/citation/question here are the
// TS-side defaults those overrides fall back to.
export const RULE_CATEGORIES: RuleCategory[] = [
  {
    icon: SignIcon,
    title: 'Nişanlar',
    description: 'Məlumatlandırıcı, xəbərdarlıq və qadağan nişanlarını nümunələrlə öyrənin.',
    citation: 'Maddə 61 | Yol nişanları',
    question: 'Yol nişanlarının növləri və mənaları hansılardır?',
  },
  {
    icon: RulesIcon,
    title: 'Qaydalar',
    description: 'Yol hərəkəti haqqında qanunvericiliyin əsas maddələri və tətbiqi qaydaları.',
    citation: 'Maddə 3 | Yol hərəkəti haqqında qanunvericilik',
    question: 'Yol hərəkəti qaydalarının əsas müddəaları hansılardır?',
  },
  {
    icon: FineIcon,
    title: 'Cərimələr və Bal Sistemi',
    description: 'Qayda pozuntularına görə tətbiq edilən cərimələr və bal sisteminin ətraflı izahı.',
    citation: 'İXM, Maddə 327-356 | Yol hərəkəti qaydaları əleyhinə olan inzibati xətalar',
    question: 'Yol hərəkəti qaydalarını pozmağa görə hansı cərimələr tətbiq olunur?',
  },
  {
    icon: UserIcon,
    title: 'Piyada Hərəkəti',
    description: 'Piyadaların keçidlərdən istifadə qaydaları və sürücülərin piyadalar qarşısında öhdəlikləri.',
    citation: 'Maddə 40 | Piyadanın vəzifələri',
    question: 'Piyadalar yolu hansı qaydalarla keçməlidir?',
  },
  {
    icon: IntersectionIcon,
    title: 'Kəsişmələr və Üstünlük Hüququ',
    description: 'Nizamlanmayan yolayrıcılarında və dairəvi hərəkətdə üstünlük hüququnun müəyyən edilməsi.',
    citation: 'Maddə 75 | Yolayrıcılarının keçilməsi',
    question: 'Nizamlanmayan yolayrıcında üstünlük hüququ necə müəyyən olunur?',
  },
  {
    icon: SpeedIcon,
    title: 'Sürət Həddi',
    description: 'Yaşayış massivlərində, magistrallarda və şəhərdaxili yollarda icazə verilən hərəkət sürəti.',
    citation: 'Maddə 50 | Hərəkət sürəti və ara məsafəsi',
    question: 'Yaşayış məntəqələrində və magistral yollarda icazə verilən sürət həddi nə qədərdir?',
  },
  {
    icon: DocumentIcon,
    title: 'Sənədlər və Sığorta',
    description: 'Sürücülük vəsiqəsi, texniki pasport və icbari sığorta ilə bağlı tələb olunan sənədlər.',
    citation: 'İXM, Maddə 339 | Qeydiyyat, texniki baxış və sürücülük vəsiqəsi ilə bağlı xətalar',
    question: 'Sürücü özü ilə hansı sənədləri gəzdirməlidir?',
  },
  {
    icon: ParkingIcon,
    title: 'Dayanma və Dayanacaq Qaydaları',
    description: 'Nəqliyyat vasitələrinin dayandırılması və saxlanmasına dair qadağalar və icazə şərtləri.',
    citation: 'Maddə 52 | Dayanma və durma',
    question: 'Harada dayanmaq və dayanacaqda durmaq qadağandır?',
  },
];
