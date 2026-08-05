'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { AdminUserRow } from '@/lib/admin/getUsers';
import { formatAzDate } from '@/lib/format/date';
import { formatCoinBalance } from '@/lib/format/coins';

const PAGE_SIZE = 20;

export default function UsersTable({ users }: { users: AdminUserRow[] }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('az-AZ');
    if (!normalized) return users;
    return users.filter((user) =>
      [user.email, user.role, user.id].some((value) => value?.toLocaleLowerCase('az-AZ').includes(normalized))
    );
  }, [query, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visibleUsers = filteredUsers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  return (
    <section className="rounded-3xl border border-border/40 bg-surface shadow-sm">
      <div className="flex flex-col gap-3 border-b border-border/40 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold text-navy">İstifadəçilər</h2>
          <p className="text-[13px] text-on-surface-variant">
            {filteredUsers.length === users.length ? `${users.length} istifadəçi` : `${filteredUsers.length} nəticə`}
          </p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          placeholder="E-poçt, rol və ya ID üzrə axtar"
          className="w-full rounded-xl border border-border/50 bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-primary sm:w-72"
          aria-label="İstifadəçi axtarışı"
        />
      </div>

      <div className="overflow-x-auto">
        {visibleUsers.length === 0 ? (
          <div className="py-16 text-center text-[14px] text-on-surface-variant">Uyğun istifadəçi tapılmadı</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 text-left">
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant">E-poçt</th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant">Rol</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant">Coin balansı</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant">Ümumi xərclənib</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant">Qeydiyyat tarixi</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => (
                <tr key={user.id} className="border-b border-border/20 last:border-b-0 hover:bg-primary/5">
                  <td className="p-0">
                    <Link href={`/admin/users/${user.id}`} className="block px-4 py-3 font-medium text-navy cursor-pointer">
                      {user.email ?? '—'}
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link href={`/admin/users/${user.id}`} className="flex px-4 py-3 cursor-pointer">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${user.role === 'admin' ? 'bg-primary text-on-primary' : 'bg-surface-tertiary text-navy'}`}>
                        {user.role}
                      </span>
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link href={`/admin/users/${user.id}`} className="block px-4 py-3 text-right text-[12px] tabular-nums text-on-surface-variant cursor-pointer">
                      {user.coinBalance != null ? formatCoinBalance(user.coinBalance) : '—'}
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link href={`/admin/users/${user.id}`} className="block px-4 py-3 text-right text-[12px] tabular-nums text-on-surface-variant cursor-pointer">
                      {user.totalSpent != null ? formatCoinBalance(user.totalSpent) : '—'}
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link href={`/admin/users/${user.id}`} className="block px-4 py-3 text-right text-[12px] tabular-nums text-on-surface-variant cursor-pointer">
                      {formatAzDate(user.created_at)}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {filteredUsers.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 border-t border-border/40 px-4 py-3 text-sm">
          <span className="text-on-surface-variant">
            {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredUsers.length)} / {filteredUsers.length}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={currentPage === 1} className="rounded-lg px-3 py-1.5 font-medium text-navy transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40">
              Əvvəlki
            </button>
            <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={currentPage === totalPages} className="rounded-lg px-3 py-1.5 font-medium text-navy transition hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40">
              Növbəti
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
