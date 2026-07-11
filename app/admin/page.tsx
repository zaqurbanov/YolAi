import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/requireAdmin';

export default async function AdminPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  redirect('/admin/documents');
}
