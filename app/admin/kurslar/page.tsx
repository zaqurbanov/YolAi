import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { listCourses } from '@/lib/lessons/courses';
import KurslarClient from './KurslarClient';

export const metadata: Metadata = {
  title: 'Kurslar',
};

// requireAdmin() runs here even though app/admin/layout.tsx already does it and
// every action re-checks independently. All three layers stay: the layout gate
// is a redirect convenience, the action gate is the real authorization, and
// this one keeps the page's own data reads from running for a non-admin.
export default async function AdminKurslarPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  // Only the course list is fetched server-side. The ingested-document picker
  // is deliberately NOT awaited here: listIngestedDocuments() runs one
  // `count: 'exact'` per document over the chunks table (27 sequential counts
  // today), which is slow enough to visibly stall this page's first paint even
  // though it is only needed once the admin opens the "new course" form. It is
  // fetched on demand by CourseCreateForm instead.
  //
  // listCourses() degrades to [] before the lessons migration is applied, so
  // this page renders its empty state rather than a 500.
  const courses = await listCourses();

  return <KurslarClient initialCourses={courses} />;
}
