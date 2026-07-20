import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import DocumentDetail from './DocumentDetail';

export default async function DocumentDetailSection({ id }: { id: string }) {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  return <DocumentDetail id={id} />;
}
