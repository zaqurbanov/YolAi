import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import BusyPhrasesSection from '../busy-phrases/BusyPhrasesSection';
import DocumentsSection from '../documents/DocumentsSection';
import DocumentDetailSection from '../documents/DocumentDetailSection';
import KurslarSection from '../kurslar/KurslarSection';
import LogsSection from '../logs/LogsSection';
import QuestionsSection from '../questions/QuestionsSection';
import QuizSection from '../quiz/QuizSection';
import StatsSection from '../stats/StatsSection';
import UsersSection from '../users/UsersSection';
import UserDetailSection from '../users/UserDetailSection';

// All 10 admin screens are served by this one optional catch-all rather than a
// page.tsx per folder. Vercel Hobby caps a deployment at 12 Serverless Functions
// and every dynamically-rendered route costs one; admin is dynamic by necessity
// (per-request role check), so 11 separate routes were 11 functions. URLs are
// unchanged — the sections still live in their original folders, only the route
// files were collapsed.

// Server-action timeout for every admin screen served by this route. Set for
// app/admin/kurslar/actions.ts: proposeTopicsAction runs a batched multi-call
// LLM outline pass and the per-topic generators each make a full generation
// call, all well past the platform default. 300 is Vercel's ceiling, and it is
// a ceiling rather than a reservation — fast actions still return immediately.
export const maxDuration = 300;

const TITLES: Record<string, string> = {
  'busy-phrases': 'Status cümlələri',
  documents: 'Sənədlər',
  kurslar: 'Kurslar',
  logs: 'Loglar',
  questions: 'Suallar',
  quiz: 'Test Sualları',
  stats: 'Statistika',
  users: 'İstifadəçilər',
};

const DETAIL_TITLES: Record<string, string> = {
  documents: 'Sənəd',
  users: 'İstifadəçi',
};

export async function generateMetadata({
  params,
}: PageProps<'/admin/[[...slug]]'>): Promise<Metadata> {
  const { slug } = await params;
  if (!slug || slug.length === 0) return {};
  const title = slug.length === 1 ? TITLES[slug[0]] : DETAIL_TITLES[slug[0]];
  return title ? { title } : {};
}

export default async function AdminCatchAllPage({ params }: PageProps<'/admin/[[...slug]]'>) {
  // Layer 1 of 3. app/admin/layout.tsx guards the shell, each section below
  // re-checks before doing its own data reads, and every server action those
  // sections call checks independently — server actions are plain POST
  // endpoints, so no layout- or dispatch-level gate protects them.
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  const { slug } = await params;
  const segments = slug ?? [];

  if (segments.length === 0) redirect('/admin/documents');

  if (segments.length === 1) {
    switch (segments[0]) {
      case 'busy-phrases':
        return <BusyPhrasesSection />;
      case 'documents':
        return <DocumentsSection />;
      case 'kurslar':
        return <KurslarSection />;
      case 'logs':
        return <LogsSection />;
      case 'questions':
        return <QuestionsSection />;
      case 'quiz':
        return <QuizSection />;
      case 'stats':
        return <StatsSection />;
      case 'users':
        return <UsersSection />;
    }
  }

  if (segments.length === 2) {
    switch (segments[0]) {
      case 'documents':
        return <DocumentDetailSection id={segments[1]} />;
      case 'users':
        return <UserDetailSection id={segments[1]} />;
    }
  }

  notFound();
}
