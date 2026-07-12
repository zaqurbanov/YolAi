import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import AdminTabs from './AdminTabs';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  return (
    <div className="max-w-[100rem] mx-auto px-6 pt-6">
      <div className="mb-2">
        <span className="mono-label text-on-surface-variant uppercase">Admin panel</span>
      </div>
      <AdminTabs />
      <div className="pb-10">{children}</div>
    </div>
  );
}
