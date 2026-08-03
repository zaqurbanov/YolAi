import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { getAdminUsers } from '@/lib/admin/getUsers';
import { formatAzDate } from '@/lib/format/date';
import { formatCoinBalance } from '@/lib/format/coins';
import GlobalRateLimitControl from './GlobalRateLimitControl';
import LlmCircuitBreakerControl from './LlmCircuitBreakerControl';
import GlobalCoinPriceControl from './GlobalCoinPriceControl';
import GlobalDailyCoinGrantControl from './GlobalDailyCoinGrantControl';
import WeeklyMarathonControl from './WeeklyMarathonControl';
import DailyMissionRewardControl from './DailyMissionRewardControl';
import QuizRewardControl from './QuizRewardControl';
import BackgroundImageControl from './BackgroundImageControl';
import LogoControl from './LogoControl';
import SendPushReminderControl from './SendPushReminderControl';
import SendBroadcastNotificationControl from './SendBroadcastNotificationControl';
import EmbeddingModelControl from './EmbeddingModelControl';
import LessonEconomyControl from './LessonEconomyControl';
import GameRewardsControl from './GameRewardsControl';
import EnergyToCoinControl from './EnergyToCoinControl';
import WheelPrizesControl from './WheelPrizesControl';
import GaragePerksControl from './GaragePerksControl';
import CategoryContentControl from './CategoryContentControl';
import CarTiersControl from './CarTiersControl';
import VipPlatePriceControl from './VipPlatePriceControl';
import PlateModerationControl from './PlateModerationControl';

export default async function UsersSection() {
  const auth = await requireAdmin();
  if (!auth.ok) redirect(auth.status === 401 ? '/login' : '/chat');

  const users = await getAdminUsers();

  return (
    <div className="pt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[28px] font-semibold leading-tight text-navy">İstifadəçilər</h1>
        <span className="inline-flex items-center rounded-full bg-surface-tertiary px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-navy">
          Cəmi {users.length}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 [&>*]:min-w-0">
        <GlobalRateLimitControl />
        <LlmCircuitBreakerControl />
        <GlobalDailyCoinGrantControl />
        <WeeklyMarathonControl />
        <DailyMissionRewardControl />
        <QuizRewardControl />
        <GlobalCoinPriceControl />
        <BackgroundImageControl />
        <LogoControl />
        <SendPushReminderControl />
        <SendBroadcastNotificationControl />
        <EmbeddingModelControl />
        <LessonEconomyControl />
        <GameRewardsControl />
        <EnergyToCoinControl />
        <WheelPrizesControl />
        <GaragePerksControl />
        <CategoryContentControl />
        <CarTiersControl />
        <VipPlatePriceControl />
        <PlateModerationControl />
      </div>

      <div className="rounded-3xl border border-border/40 bg-surface shadow-sm overflow-hidden overflow-x-auto">
        {users.length === 0 ? (
          <div className="py-16 text-center text-[14px] text-on-surface-variant">Hələ istifadəçi yoxdur</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 text-left">
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant">
                  E-poçt
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant">
                  Rol
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant text-right">
                  Coin balansı
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant text-right">
                  Ümumi xərclənib
                </th>
                <th className="px-4 py-3 text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant text-right">
                  Qeydiyyat tarixi
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b border-border/20 last:border-b-0 hover:bg-primary/5"
                >
                  <td className="p-0">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="block px-4 py-3 font-medium text-navy cursor-pointer"
                    >
                      {u.email ?? '—'}
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link href={`/admin/users/${u.id}`} className="flex px-4 py-3 cursor-pointer">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${
                          u.role === 'admin' ? 'bg-primary text-on-primary' : 'bg-surface-tertiary text-navy'
                        }`}
                      >
                        {u.role}
                      </span>
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="block px-4 py-3 text-[12px] tabular-nums text-right text-on-surface-variant cursor-pointer"
                    >
                      {u.coinBalance != null ? formatCoinBalance(u.coinBalance) : '—'}
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="block px-4 py-3 text-[12px] tabular-nums text-right text-on-surface-variant cursor-pointer"
                    >
                      {u.totalSpent != null ? formatCoinBalance(u.totalSpent) : '—'}
                    </Link>
                  </td>
                  <td className="p-0">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="block px-4 py-3 text-[12px] tabular-nums text-right text-on-surface-variant cursor-pointer"
                    >
                      {formatAzDate(u.created_at)}
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
