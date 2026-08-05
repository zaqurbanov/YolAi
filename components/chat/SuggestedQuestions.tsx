'use client';

import { ArrowRightIcon } from '@/components/icons';

// Starter questions for an empty chat — "what can I even ask?".
//
// CLICKING ONE ONLY FILLS THE COMPOSER; it never sends. Sending a message
// debits a coin, so the send has to stay a deliberate act by the user — the
// same rule that already governs `initialInput` (the /chat?q=... seed from the
// home page cards): seed only, never auto-submitted. It also lets the user edit
// the suggestion before asking, which is usually what they want.
//
// LAYOUT: a left-aligned STACK, not centered wrapping pills. Pills sized to
// their own text produced ragged rows of different widths and lengths, which
// reads as clutter exactly where the screen should feel calm and scannable.
// Full-width rows share one left edge, so the eye runs straight down the list.
// This is also why the parent's `text-center` is overridden here rather than
// inherited.
//
// The list is a constant rather than an admin setting on purpose: these are
// examples of the SHAPE of a good question, not content that changes with the
// corpus or with prices. If the owner ever wants to tune them per season, this
// is the one place to lift into app_settings.
//
// Chosen to span what the ingested corpus actually covers — signs, priority,
// stopping/parking, speed, overtaking — so a click lands on a question the RAG
// pipeline can genuinely answer from the documents, not a dead end.
const SUGGESTIONS = [
  'Yolayrıcında kim üstünlük hüququna malikdir?',
  'Dayanmaq və durmaq arasında nə fərq var?',
  'Hansı hallarda ötmək qadağandır?',
  'Piyada keçidinə yaxınlaşanda nə etməliyəm?',
];

export default function SuggestedQuestions({
  onPick,
  className,
}: {
  onPick: (question: string) => void;
  className?: string;
}) {
  return (
    <div className={`text-left ${className ?? ''}`}>
      <p className="text-label-sm text-on-surface-variant">Nə soruşa bilərsiniz?</p>

      <ul className="mt-2 flex flex-col">
        {SUGGESTIONS.map((question) => (
          <li key={question}>
            <button
              type="button"
              onClick={() => onPick(question)}
              className="group flex w-full items-center justify-between gap-3 border-b border-outline-variant/25 py-2.5 text-left text-[13px] leading-snug text-on-surface transition-colors last:border-b-0 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="min-w-0">{question}</span>
              <ArrowRightIcon
                width={13}
                height={13}
                aria-hidden
                className="shrink-0 text-on-surface-variant transition-transform group-hover:translate-x-0.5 group-hover:text-primary motion-reduce:transform-none"
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
