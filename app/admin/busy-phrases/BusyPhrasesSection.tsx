import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import BusyPhrasesManager from './BusyPhrasesManager';

export default async function BusyPhrasesSection() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  return (
    <div className="pt-6 space-y-6">
      <div className="space-y-1">
        <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-primary">Status mesajları</span>
        <h1 className="text-[28px] font-semibold leading-tight text-navy">Status cümlələri</h1>
      </div>
      <BusyPhrasesManager />
    </div>
  );
}
