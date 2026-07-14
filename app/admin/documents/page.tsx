import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import UploadForm from './UploadForm';

export const metadata: Metadata = {
  title: 'Sənədlər',
};

export default async function AdminDocumentsPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  return <UploadForm />;
}
