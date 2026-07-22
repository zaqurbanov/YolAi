import { Fragment, type ReactNode } from 'react';

// Renderer for the RESTRICTED markdown subset the admin lesson generator
// produces: ## / ### headings, "- " lists, "> " quotes, **bold**, paragraphs.
//
// Hand-rolled on purpose, and it must stay that way:
//  - the content is LLM-drafted (admin-reviewed, but still model output), so it
//    is treated as untrusted text. React elements are built directly; there is
//    no dangerouslySetInnerHTML and no HTML passthrough anywhere, so a model
//    that emits `<script>` or a `javascript:` URL renders it as literal text.
//  - anything outside the subset (tables, code fences, links, images) is
//    deliberately NOT special-cased — it falls through as plain text rather
//    than pulling in a markdown parser for a handful of constructs.

const BOLD_SPLIT_RE = /(\*\*[^*]+\*\*)/g;

function renderInline(text: string): ReactNode[] {
  return text.split(BOLD_SPLIT_RE).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
      <strong key={i} className="font-semibold text-on-surface">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

type Block =
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'quote'; items: string[] };

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'p', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  for (const rawLine of source.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim();

    if (line === '') {
      flushParagraph();
      continue;
    }
    if (line.startsWith('### ')) {
      flushParagraph();
      blocks.push({ kind: 'h3', text: line.slice(4) });
      continue;
    }
    if (line.startsWith('## ')) {
      flushParagraph();
      blocks.push({ kind: 'h2', text: line.slice(3) });
      continue;
    }
    if (line.startsWith('- ')) {
      flushParagraph();
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'ul') last.items.push(line.slice(2));
      else blocks.push({ kind: 'ul', items: [line.slice(2)] });
      continue;
    }
    if (line.startsWith('> ')) {
      flushParagraph();
      const last = blocks[blocks.length - 1];
      if (last?.kind === 'quote') last.items.push(line.slice(2));
      else blocks.push({ kind: 'quote', items: [line.slice(2)] });
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  return blocks;
}

export default function LessonMarkdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  const blocks = parse(content);

  return (
    <div className={className}>
      {blocks.map((block, i) => {
        if (block.kind === 'h2') {
          return (
            <h2 key={i} className="mt-8 mb-3 text-headline-md first:mt-0">
              {renderInline(block.text)}
            </h2>
          );
        }
        if (block.kind === 'h3') {
          return (
            <h3 key={i} className="mt-6 mb-2 text-headline-md text-[18px] first:mt-0">
              {renderInline(block.text)}
            </h3>
          );
        }
        if (block.kind === 'ul') {
          return (
            <ul key={i} className="my-3 space-y-2">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-2.5 text-body-md text-on-surface-variant">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{renderInline(item)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (block.kind === 'quote') {
          return (
            <blockquote
              key={i}
              className="my-4 rounded-r-xl border-l-4 border-safety-yellow bg-safety-yellow/5 px-4 py-3 text-body-md text-on-surface-variant"
            >
              {block.items.map((item, j) => (
                <p key={j}>{renderInline(item)}</p>
              ))}
            </blockquote>
          );
        }
        return (
          <p key={i} className="my-3 text-body-md leading-relaxed text-on-surface-variant">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
}
