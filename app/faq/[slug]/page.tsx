import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buttonVariants } from '@heroui/styles';
import Footer from '@/components/Footer';
import { formatAzDate } from '@/lib/format/date';
import { FAQ_SLUGS, getFaqPage } from '@/lib/content/faqPages';

const EMAIL_SPLIT_RE = /([\w.+-]+@[\w-]+\.[\w.-]+)/g;
const EMAIL_TEST_RE = /^[\w.+-]+@[\w-]+\.[\w.-]+$/;

function renderWithMailto(text: string) {
  const parts = text.split(EMAIL_SPLIT_RE);
  return parts.map((part, i) =>
    EMAIL_TEST_RE.test(part) ? (
      <a key={i} href={`mailto:${part}`} className="text-primary hover:underline">
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export function generateStaticParams() {
  return FAQ_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = getFaqPage(slug);
  return { title: page?.metaTitle ?? 'YOL' };
}

export default async function FaqPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = getFaqPage(slug);
  if (!page) notFound();

  return (
    <div id="top" className="flex flex-1 flex-col">
      <section className="relative overflow-hidden px-6 py-16 lg:py-20">
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
        <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          {page.badge && (
            <span className="mono-label rounded-full bg-primary/15 px-3 py-1 text-primary">
              {page.badge}
            </span>
          )}
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            {page.title}
          </h1>
          {page.description && (
            <p className="max-w-xl text-on-surface-variant">{page.description}</p>
          )}
          {page.showUpdatedDate && (
            <p className="mono-label text-on-surface-variant">
              Son yenilənmə: {formatAzDate(new Date())}
            </p>
          )}
        </div>
      </section>

      <section className="px-6 py-8 lg:py-12">
        <div className="mx-auto max-w-3xl space-y-6">
          {page.sections.map((section) => (
            <div key={section.heading} className="glass-card rounded-2xl p-6 text-sm leading-relaxed sm:p-8">
              <h2 className="font-display text-lg font-semibold text-on-surface">{section.heading}</h2>
              <div className="mt-3 space-y-2">
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="text-on-surface-variant">
                    {renderWithMailto(paragraph)}
                  </p>
                ))}
              </div>
            </div>
          ))}

          {page.cta && (
            <div className="flex justify-center pt-2">
              <Link
                href={page.cta.href}
                className={buttonVariants({ variant: 'primary', size: 'lg' }) + ' glow-primary'}
              >
                {page.cta.label}
              </Link>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
