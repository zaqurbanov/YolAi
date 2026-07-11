import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import UploadForm from './UploadForm';

export default async function AdminDocumentsPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  return <UploadForm />;
}
