import { ChatIcon, RulesIcon, CoinIcon, TrophyIcon, AwardIcon } from '@/components/icons';
import { getCategoryContent } from '@/lib/content/categoryContent';
import { getRegisteredDriverCount, getRecentDriverInitials } from '@/lib/content/getRegisteredDriverCount';
import DesignSwitch from '@/components/design3d/DesignSwitch';
import HomePage3D from '@/components/design3d/HomePage3D';
import { getServerDesign } from '@/lib/design/getServerDesign';
import EditorialLanding from '@/components/home/EditorialLanding';

// LANDING PAGE. Public, and deliberately session-free: this route no longer
// calls supabase.auth.getUser() at all.
//
// It used to be both things at once — marketing for strangers and a personal
// dashboard for signed-in users, branching inside one component. That is why
// the previous note here recorded a regression: the page had been pure ISR
// until the per-user dashboard was merged in, which dragged cookies() (and
// therefore per-request rendering) onto the one route CLAUDE.md's Vercel
// function-budget section names as "would go static". The dashboard now lives
// at /home, and every read below is public data.
//
// A signed-in visitor never lands here: proxy.ts redirects `/` to /home once a
// session cookie is present, so this page only ever renders for strangers.
//
// STILL DYNAMIC, for one remaining reason: getServerDesign() reads the design
// cookie so the 3D tree can be server-rendered without a flash. Dropping the 3D
// landing variant is the only thing between this route and a fully static
// render — a deliberate open decision, not an oversight.
export const revalidate = 3600;

// MOCK: "Düzgün cavab nisbəti" has no real accuracy-tracking metric behind
// it (no user feedback/rating system exists yet) and "24/7" is a descriptive
// fact about support availability, not a measured figure — both stay
// illustrative placeholders. The registered-user count next to them (first
// tile, added in the component body below) is real, from
// getRegisteredDriverCount().
const MOCK_STATS_TAIL = [
  { value: '98%', label: 'Düzgün cavab nisbəti', accent: 'text-go-green' },
  { value: '24/7', label: 'Hüquqi dəstək', accent: 'text-regulatory-blue' },
];

// "What you can do here" — the app's four pillars, linking to each. Accent
// colours cycle through the same traffic-signal palette the category cards use,
// so the landing page reads as one system.
const FEATURES = [
  {
    icon: ChatIcon,
    title: 'AI Söhbət',
    desc: 'Yol qaydaları ilə bağlı istənilən sualı yaz — rəsmi sənədlərə əsaslanan, mənbəyə istinad edən cavab al. Vəziyyətin şəklini də göndərə bilərsən.',
    href: '/chat',
    cta: 'Suala başla',
    chip: 'bg-primary/15 text-primary',
    border: 'border-l-primary',
  },
  {
    icon: RulesIcon,
    title: 'Sürücülük dərsləri',
    desc: 'Kateqoriyalar üzrə dərsləri oxu, hər mövzunun sonundakı testi keç və irəliləyişini izlə — sürücülük vəsiqəsi imtahanına addım-addım hazırlaş.',
    href: '/oyrenme',
    cta: 'Dərslərə başla',
    chip: 'bg-regulatory-blue/15 text-regulatory-blue',
    border: 'border-l-regulatory-blue',
  },
  {
    icon: CoinIcon,
    title: 'Coin qazan',
    desc: 'Gündəlik sual, ardıcıllıq seriyası, dostları dəvət və reklam izləmə ilə coin topla. Coinlərlə pulsuz gündəlik limitdən sonra da AI söhbətini davam etdir.',
    href: '/coin-qazan',
    cta: 'Coin qazan',
    chip: 'bg-safety-yellow/15 text-safety-yellow',
    border: 'border-l-safety-yellow',
  },
  {
    icon: TrophyIcon,
    title: 'Oyunlar və Çarx',
    desc: 'Kompüterə qarşı XO oyna, gündəlik pulsuz çarxı fırlat və həftəlik reytinqdə yerini tut — əylənərək coin qazan.',
    href: '/coin-qazan',
    cta: 'Oynamağa başla',
    chip: 'bg-go-green/15 text-go-green',
    border: 'border-l-go-green',
  },
  // Kept as the LAST card on purpose: on the desktop 2-col grid the original
  // four cards stay in their familiar 2x2 layout, and the exam lands on its
  // own row as the flagship call-to-action. On the mobile rail it's simply
  // the fifth slide.
  {
    icon: AwardIcon,
    title: 'Rəsmi imtahan simulyasiyası',
    desc: 'Rəsmi imtahan formatında suallara cavab ver, vaxt limitini idarə et və keçid balına çat — real imtahandan əvvəl özünü tam sınaqdan keçir.',
    href: '/imtahan',
    cta: 'İmtahana başla',
    chip: 'bg-caution-orange/15 text-caution-orange',
    border: 'border-l-caution-orange',
  },
];

export default async function Home() {
  const [design, driverCount, driverInitials, categories] = await Promise.all([
    getServerDesign(),
    getRegisteredDriverCount(),
    getRecentDriverInitials(),
    getCategoryContent(),
  ]);

  // Real citation reused (not invented) for the 3D hero's floating "cərimə"
  // alert card — sourced from the same merged entry the topic grid renders, so
  // the hero doesn't introduce a second, drifting copy of it.
  const fineCategory = categories.find((category) => category.title === 'Cərimələr və Bal Sistemi')!;
  const formattedDriverCount = driverCount.toLocaleString('az-AZ');
  const stats = [
    { value: formattedDriverCount, label: 'Aktiv istifadəçi', accent: 'text-primary' },
    ...MOCK_STATS_TAIL,
  ];

  return (
    <DesignSwitch
      design={design}
      simple={
        <EditorialLanding
          featureCards={FEATURES}
          stats={stats}
          formattedDriverCount={formattedDriverCount}
          driverInitials={driverInitials}
        />
      }
      threeD={
        <HomePage3D
          formattedDriverCount={formattedDriverCount}
          driverInitials={driverInitials}
          stats={stats}
          fineCategory={fineCategory}
        />
      }
    />
  );
}
