import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import DocumentDetail from './DocumentDetail';

export const metadata: Metadata = {
  title: 'Sənəd',
};

export default async function AdminDocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  const { id } = await params;

  return <DocumentDetail id={id} />;
}
