'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

// FOCUS MODE for the topic test: while an attempt is running, the lesson text
// is removed from the page.
//
// WHY. The reading material and the test live on the SAME route (the test is a
// client-side phase of /oyrenme/[courseId]/[topicId], not a route of its own —
// see TopicTest's header comment for that decision). That layout let a learner
// read a question, scroll back up to the article, find the sentence the answer
// was drawn from, and score without learning anything. The topic test exists to
// measure recall, so the article is unmounted for the duration of an attempt.
//
// UNMOUNTED, not hidden with CSS: `display:none` would leave the answers in the
// DOM for find-in-page and devtools. This is not a security boundary either way
// — the content already reached the browser in the initial HTML — but there is
// no reason to leave it one keystroke away.
//
// The flag lives in a context rather than inside TopicTest because the two
// design trees (editorial and 3D/HUD) render the article card, the test and the
// prev/next nav as SIBLINGS, in different components. A context lets each tree
// wrap whichever of its own nodes should disappear, without threading a boolean
// through props neither tree otherwise cares about.
//
// Leaving mid-test stays possible — the breadcrumb and the navbar are
// untouched. Abandoning costs the drawn question set (nothing is recorded until
// submit), which is the honest trade: the learner is not trapped, they just
// cannot read and answer at the same time.

interface TopicTestFocusValue {
  isTestRunning: boolean;
  setTestRunning: (running: boolean) => void;
}

// Fallback for a tree that never mounted the provider: reads as "not running",
// so an un-wrapped TopicTest behaves exactly as it did before this existed.
const INERT: TopicTestFocusValue = { isTestRunning: false, setTestRunning: () => {} };

const TopicTestFocusContext = createContext<TopicTestFocusValue | null>(null);

export function TopicTestFocusProvider({ children }: { children: ReactNode }) {
  const [isTestRunning, setTestRunning] = useState(false);
  const value = useMemo(() => ({ isTestRunning, setTestRunning }), [isTestRunning]);

  return <TopicTestFocusContext.Provider value={value}>{children}</TopicTestFocusContext.Provider>;
}

export function useTopicTestFocus(): TopicTestFocusValue {
  return useContext(TopicTestFocusContext) ?? INERT;
}

/** Renders its children only while no attempt is in progress. */
export default function HideDuringTest({ children }: { children: ReactNode }) {
  const { isTestRunning } = useTopicTestFocus();

  if (isTestRunning) return null;
  return <>{children}</>;
}
