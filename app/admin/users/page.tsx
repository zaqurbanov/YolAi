import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { getAdminUsers } from '@/lib/admin/getUsers';
import { Chip } from '@heroui/react';
import GlobalRateLimitControl from './GlobalRateLimitControl';

export const metadata: Metadata = {
  title: 'İstifadəçilər',
};

const dateFormatter = new Intl.DateTimeFormat('az-AZ', { year: 'numeric', month: 'short', day: 'numeric' });

export default async function AdminUsersPage() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  const users = await getAdminUsers();

  return (
    <div className="pt-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">İstifadəçilər</h1>
        <span className="mono-label text-on-surface-variant">Cəmi {users.length}</span>
      </div>

      <GlobalRateLimitControl />

      <div className="glass-panel rounded-2xl overflow-hidden overflow-x-auto">
        {users.length === 0 ? (
          <div className="py-16 text-center text-sm text-on-surface-variant">Hələ istifadəçi yoxdur</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-outline-variant/40 text-left">
                <th className="px-4 py-3 font-medium text-on-surface-variant">E-poçt</th>
                <th className="px-4 py-3 font-medium text-on-surface-variant">Rol</th>
                <th className="px-4 py-3 font-medium text-on-surface-variant text-right">Qeydiyyat tarixi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-outline-variant/20 last:border-b-0 hover:bg-surface-container-high/40"
                >
                  <td className="p-0">
                    <Link href={`/admin/users/${u.id}`} className="block px-4 py-3 cursor-pointer">
                      {u.email ?? '—'}
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link href={`/admin/users/${u.id}`} className="flex px-4 py-3 cursor-pointer">
                      <Chip size="sm" color={u.role === 'admin' ? 'success' : 'default'}>
                        {u.role}
                      </Chip>
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="block px-4 py-3 mono-label text-right text-on-surface-variant cursor-pointer"
                    >
                      {dateFormatter.format(new Date(u.created_at))}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
