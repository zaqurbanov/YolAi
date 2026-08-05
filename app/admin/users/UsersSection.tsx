import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { getAdminUsers } from '@/lib/admin/getUsers';
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
import GameEnergyCostControl from './GameEnergyCostControl';
import EnergyToCoinControl from './EnergyToCoinControl';
import WheelPrizesControl from './WheelPrizesControl';
import GaragePerksControl from './GaragePerksControl';
import CategoryContentControl from './CategoryContentControl';
import CarTiersControl from './CarTiersControl';
import VipPlatePriceControl from './VipPlatePriceControl';
import PlateModerationControl from './PlateModerationControl';
import UsersTable from './UsersTable';
import AdminSettingsTabs from './AdminSettingsTabs';

function SettingsGroup({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-3">
      <div>
        <h2 className="text-[16px] font-semibold text-navy">{title}</h2>
        <p className="mt-0.5 text-[13px] text-on-surface-variant">{description}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">{children}</div>
    </section>
  );
}

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

      <AdminSettingsTabs
        tabs={[
          { id: 'ai-limits', label: 'AI və limitlər' },
          { id: 'rewards-energy', label: 'Mükafatlar və enerji' },
          { id: 'content-appearance', label: 'Məzmun və görünüş' },
          { id: 'notifications', label: 'Bildirişlər' },
          { id: 'garage', label: 'Virtual qaraj' },
        ]}
      >
        <SettingsGroup id="ai-limits" title="AI və istifadə limitləri" description="Söhbət imkanları, gündəlik limitlər və AI infrastrukturunun idarəsi.">
          <GlobalRateLimitControl />
          <LlmCircuitBreakerControl />
          <GlobalDailyCoinGrantControl />
          <GlobalCoinPriceControl />
          <EmbeddingModelControl />
        </SettingsGroup>

        <SettingsGroup id="rewards-energy" title="Mükafatlar və enerji" description="Gündəlik tapşırıqlar, oyunlar, coin və enerji iqtisadiyyatı.">
          <WeeklyMarathonControl />
          <DailyMissionRewardControl />
          <QuizRewardControl />
          <LessonEconomyControl />
          <GameRewardsControl />
          <GameEnergyCostControl />
          <EnergyToCoinControl />
          <WheelPrizesControl />
        </SettingsGroup>

        <SettingsGroup id="content-appearance" title="Məzmun və görünüş" description="Sayt brendi, ana səhifə materialları və tədris məzmunu.">
          <BackgroundImageControl />
          <LogoControl />
          <CategoryContentControl />
        </SettingsGroup>

        <SettingsGroup id="notifications" title="Bildirişlər" description="İstifadəçilərə göndərilən xatırlatma və ümumi elanlar.">
          <SendPushReminderControl />
          <SendBroadcastNotificationControl />
        </SettingsGroup>

        <SettingsGroup id="garage" title="Virtual qaraj" description="Avtomobil üstünlükləri, nömrələr və qaraj iqtisadiyyatı.">
          <GaragePerksControl />
          <CarTiersControl />
          <VipPlatePriceControl />
          <PlateModerationControl />
        </SettingsGroup>
      </AdminSettingsTabs>

      <UsersTable users={users} />
    </div>
  );
}
