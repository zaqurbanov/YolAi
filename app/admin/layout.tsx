import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import AdminTabs from './AdminTabs';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  return (
    <div className="editorial mx-auto w-full max-w-[100rem] px-6 pt-8 md:px-12">
      <div className="mb-4">
        <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-primary">Admin panel</span>
      </div>
      <AdminTabs />
      <div className="pb-24 md:pb-16">{children}</div>
    </div>
  );
}
