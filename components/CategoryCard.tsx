import Link from 'next/link';
import { Card } from '@heroui/react';
import type { RuleCategory } from '@/lib/content/ruleCategories';

// Literal Tailwind class names per accent (not built via template-string
// interpolation) so Tailwind v4's content scanner — which extracts candidates
// as raw text, not evaluated JS — can see every class it needs to generate.
// Cycled across category-card grids (home preview + full /oyrenme lesson list)
// to mirror the Stitch bento grid's varied traffic-accent left borders
// (regulatory-blue/safety-yellow/go-green/caution-orange) without touching
// RULE_CATEGORIES data. Also reused (via the exported ACCENT_STYLES array
// below) by app/oyrenme/page.tsx's lesson-card grid, which needs the same
// accent cycling but with lesson-progress chrome CategoryCard itself
// doesn't render.
export const ACCENT_STYLES = [
  { chip: 'bg-primary/15 text-primary group-hover:bg-primary/25', border: 'border-l-primary', citation: 'text-primary' },
  { chip: 'bg-regulatory-blue/15 text-regulatory-blue group-hover:bg-regulatory-blue/25', border: 'border-l-regulatory-blue', citation: 'text-regulatory-blue' },
  { chip: 'bg-safety-yellow/15 text-safety-yellow group-hover:bg-safety-yellow/25', border: 'border-l-safety-yellow', citation: 'text-safety-yellow' },
  { chip: 'bg-go-green/15 text-go-green group-hover:bg-go-green/25', border: 'border-l-go-green', citation: 'text-go-green' },
  { chip: 'bg-caution-orange/15 text-caution-orange group-hover:bg-caution-orange/25', border: 'border-l-caution-orange', citation: 'text-caution-orange' },
] as const;

interface CategoryCardProps {
  category: RuleCategory;
  /** Index into ACCENT_STYLES — pass the item's position in the rendered grid. */
  index: number;
  /** Wraps the card in a Link when provided (used by the home-page category preview). */
  href?: string;
  /** Stagger delay in ms for the topic-card-in entrance animation. */
  animationDelayMs?: number;
}

// Shared "category card" treatment for the traffic-rule category grid shown
// on app/page.tsx (6-item home preview) — single source of truth for that
// card shape. app/oyrenme/page.tsx renders the same accent styling for its
// lesson cards but with different content (progress bar, CTA), so it uses
// ACCENT_STYLES directly rather than this component.
export function CategoryCard({ category, index, href, animationDelayMs }: CategoryCardProps) {
  const { icon: Icon, title, description, citation } = category;
  const accent = ACCENT_STYLES[index % ACCENT_STYLES.length];

  const card = (
    <Card
      className={`topic-card-in motion-reduce:animate-none glass-card group h-full border border-transparent border-l-4 ${accent.border} transition duration-200 hover:-translate-y-1 hover:shadow-lg`}
      style={animationDelayMs !== undefined ? { animationDelay: `${animationDelayMs}ms` } : undefined}
    >
      <Card.Header>
        <div
          className={`mb-2 flex size-12 items-center justify-center rounded-xl transition duration-200 group-hover:scale-110 ${accent.chip}`}
        >
          <Icon />
        </div>
        <Card.Title className="text-headline-md text-[20px]">{title}</Card.Title>
        <Card.Description className="text-body-md text-on-surface-variant">
          {description}
        </Card.Description>
      </Card.Header>
      <Card.Footer className="mt-2 border-t border-outline-variant/40 pt-3">
        <span className={`text-legal-citation ${accent.citation}`}>{citation}</span>
      </Card.Footer>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {card}
      </Link>
    );
  }

  return card;
}
