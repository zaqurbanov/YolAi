import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import BusyPhrasesManager from './BusyPhrasesManager';

export const metadata: Metadata = {
  title: 'Status cümlələri',
};

export default async function AdminBusyPhrasesPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  return (
    <div className="pt-6 space-y-6">
      <h1 className="text-2xl font-semibold">Status cümlələri</h1>
      <BusyPhrasesManager />
    </div>
  );
}
