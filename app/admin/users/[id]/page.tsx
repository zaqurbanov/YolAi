import { redirect, notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { getAdminUserDetail, getAdminUserConversations } from '@/lib/admin/getUserDetail';
import UserDetail from './UserDetail';

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  const { id } = await params;

  const detail = await getAdminUserDetail(id);
  if (!detail) notFound();

  const conversationsPage = await getAdminUserConversations(id, { limit: 10, offset: 0 });

  return (
    <UserDetail
      userId={id}
      detail={detail}
      initialConversations={conversationsPage}
      viewerIsSuperAdmin={auth.role === 'super_admin'}
    />
  );
}
