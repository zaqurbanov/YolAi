import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Avatar, Button } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { SparkleIcon, CoinIcon, TrashIcon, LogoutIcon, CheckIcon, FlameIcon } from '@/components/icons';
import Footer from '@/components/Footer';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/app/(auth)/actions';
import { getAccountStats } from '@/lib/account/getAccountStats';
import { getCoinBalanceStatus } from '@/lib/chat/coins';
import { getTransferMinAmount, getTransferHistory } from '@/lib/coins/transfers';
import { getQuizClaimsCount, getStreakStatus } from '@/lib/coins/quiz';
import { formatAzDate } from '@/lib/format/date';
import { formatMsUntilReset } from '@/lib/format/coins';
import AdSlot from '@/components/AdSlot';
import ProfileForm from '@/components/account/ProfileForm';
import SecurityForms from '@/components/account/SecurityForms';
import DeleteAccountDialog from '@/components/account/DeleteAccountDialog';
import TransferCoinsForm from '@/components/account/TransferCoinsForm';
import TransferHistoryList from '@/components/account/TransferHistoryList';
import PreferencesCard from '@/components/account/PreferencesCard';
import PushNotificationOptIn from '@/components/account/PushNotificationOptIn';
import SecurityQuickView from '@/components/account/SecurityQuickView';
import DesignSwitch from '@/components/design3d/DesignSwitch';
import AccountPage3D from '@/components/design3d/AccountPage3D';
import { getServerDesign } from '@/lib/design/getServerDesign';

export const metadata: Metadata = {
  title: 'Hesab',
};

function initialsFrom(name: string | null, email: string): string {
  const source = name?.trim() || email;
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default async function AccountPage() {
  const design = await getServerDesign();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, avatar_url, created_at')
    .eq('id', user.id)
    .single();

  const stats = await getAccountStats();

  const fullName = profile?.full_name ?? '';
  const avatarUrl = profile?.avatar_url ?? '';
  const isAdmin = profile?.role === 'admin';
  const memberSince = profile?.created_at ? formatAzDate(profile.created_at) : '—';

  const coins = isAdmin ? null : await getCoinBalanceStatus(user.id);

  const [transferMinAmount, transferHistory, quizClaimsCount, streakStatus] = isAdmin
    ? [null, null, null, null]
    : await Promise.all([
        getTransferMinAmount(),
        getTransferHistory(user.id),
        getQuizClaimsCount(user.id),
        getStreakStatus(user.id),
      ]);

  const totalSpent = isAdmin
    ? 0
    : ((await supabase.from('user_coins').select('total_spent').eq('user_id', user.id).maybeSingle()).data
        ?.total_spent ?? 0);

  const statTiles = [
    { label: 'Söhbətlər', value: stats.conversations, accent: 'text-primary' },
    { label: 'Mesajlar', value: stats.messages, accent: 'text-regulatory-blue' },
    { label: 'Üzv olub', value: memberSince, accent: 'text-go-green' },
  ];

  // "Hüquqi Bilik Səviyyəsi" is a motivational engagement indicator, NOT a
  // legal-competency claim — it combines two signals, each capped at 50
  // points so neither alone can max out the bar: quiz participation
  // (5 pts/claim, up to 10 claims) and chat engagement (coins spent, 1 pt
  // per 2 coins). This must never be presented as a real qualification.
  const quizPoints = Math.min((quizClaimsCount ?? 0) * 5, 50);
  const spentPoints = Math.min(Math.round(totalSpent / 2), 50);
  const knowledgeLevelPercent = Math.min(100, quizPoints + spentPoints);
  const knowledgeLevelLabel =
    knowledgeLevelPercent < 25
      ? 'Yeni başlayan'
      : knowledgeLevelPercent < 60
        ? 'Öyrənən'
        : knowledgeLevelPercent < 85
          ? 'Təcrübəli'
          : 'Ekspert';

  // Each interactive/stateful child is built once and reused by BOTH the
  // `simple` and `threeD` trees below (DesignSwitch only ever mounts one at
  // a time) — same pattern app/coin-qazan/page.tsx uses for its cards.
  // Internal render logic/server-action wiring is untouched either way;
  // only the surrounding chrome differs per design.
  const profileForm = <ProfileForm fullName={fullName} avatarUrl={avatarUrl} email={user.email ?? ''} />;
  const preferencesCard = <PreferencesCard />;
  const pushOptIn = <PushNotificationOptIn />;
  const securityQuickView = <SecurityQuickView lastSignInAt={user.last_sign_in_at ?? null} />;
  const transferForm = transferMinAmount != null ? <TransferCoinsForm minAmount={transferMinAmount} /> : null;
  const transferHistoryList = transferHistory ? (
    <TransferHistoryList sent={transferHistory.sent} received={transferHistory.received} />
  ) : null;
  const securityForms = <SecurityForms />;
  const logoutForm = (
    <form action={logout}>
      <Button type="submit" variant="danger" className="gap-2">
        <LogoutIcon width={18} height={18} />
        Hesabdan çıxış et
      </Button>
    </form>
  );
  const deleteAccountDialog = <DeleteAccountDialog />;

  return (
    <DesignSwitch
      design={design}
      simple={
        <div className="editorial flex flex-1 flex-col pb-24 md:pb-0">
          <div className="mx-auto w-full max-w-[1280px] space-y-16 px-6 pt-10 md:space-y-28 md:px-16 md:pt-16">
            <section className="grid grid-cols-1 items-center gap-8 md:grid-cols-12">
              <div className="space-y-6 md:col-span-7">
                <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-primary">Hesab</span>
                <h1 className="text-[32px] font-semibold leading-[1.15] text-navy md:text-[40px]">
                  {fullName ? (
                    <>
                      Xoş gəldin, <span className="text-primary">{fullName}</span>.
                    </>
                  ) : (
                    'Xoş gəldin.'
                  )}
                </h1>

                <div className="flex flex-wrap items-center gap-4">
                  <div className="relative shrink-0">
                    <Avatar size="lg" className="ring-2 ring-primary/30">
                      {avatarUrl ? <Avatar.Image src={avatarUrl} alt="Profil şəkli" /> : null}
                      <Avatar.Fallback>{initialsFrom(fullName, user.email ?? '')}</Avatar.Fallback>
                    </Avatar>
                    {/* Decorative only: every account reaching this page is already an
                        authenticated Supabase user — there is no separate "verified"
                        status tracked in the schema. Kept purely to match the Stitch
                        mockup's green check badge on the avatar. */}
                    <div className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border-2 border-surface bg-go-green text-white">
                      <CheckIcon width={12} height={12} strokeWidth={3} />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[18px] font-semibold text-navy">{fullName || user.email}</p>
                    <p className="truncate text-[14px] text-on-surface-variant">{user.email}</p>
                    <div className="mt-2">
                      {isAdmin ? (
                        <span className="inline-flex items-center rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-on-primary">
                          Admin
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-surface-tertiary px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-navy">
                          İstifadəçi
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 md:col-span-5">
                {statTiles.map((tile) => (
                  <div key={tile.label} className="rounded-2xl border border-border/40 bg-surface p-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-on-surface-variant">
                      {tile.label}
                    </div>
                    <div
                      className={`mt-1 editorial-display text-[28px] font-bold leading-none tabular-nums md:text-[32px] ${tile.accent}`}
                    >
                      {tile.value}
                    </div>
                  </div>
                ))}

                <div className="space-y-4 rounded-3xl border border-border/40 bg-surface p-6 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-[12px] font-bold uppercase tracking-[0.1em] text-navy">
                      Hüquqi Bilik Səviyyəsi
                    </span>
                    <span className="inline-flex items-center rounded-full bg-surface-tertiary px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-navy">
                      {knowledgeLevelLabel}
                    </span>
                  </div>
                  <div className="h-3 w-full overflow-hidden rounded-full bg-surface-tertiary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(knowledgeLevelPercent, 2)}%` }}
                    />
                  </div>
                  {!isAdmin && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Link
                        href="/coin-qazan/leaderboard"
                        className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-primary transition-[gap] hover:gap-2.5"
                      >
                        Liderlik lövhəsinə bax →
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </section>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {profileForm}
            <div className="flex flex-col gap-6">
              {preferencesCard}
              {pushOptIn}
              {securityQuickView}
            </div>
          </div>

          {coins ? (
            <div className="rounded-3xl border border-border/40 bg-surface p-6 shadow-sm md:p-10">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-safety-yellow/15 text-safety-yellow">
                  <CoinIcon />
                </div>
                <h2 className="text-[18px] font-semibold leading-tight text-navy">Gündəlik limit</h2>
              </div>
              <div className="mt-4 text-[18px] font-semibold text-navy">
                Qalan coin: <span className="font-semibold text-safety-yellow">{coins.balance}</span>
              </div>
              <div className="mt-1 text-[14px] text-on-surface-variant">
                Sıfırlanmaya qalan vaxt: {formatMsUntilReset(coins.msUntilReset)}
              </div>
              {streakStatus && streakStatus.current > 0 && (
                <div className="mt-2 flex items-center gap-1.5 text-[14px] text-caution-orange">
                  <FlameIcon width={16} height={16} />
                  <span>{streakStatus.current} gün ardıcıl seriya</span>
                </div>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/qiymetler"
                  className={buttonVariants({ variant: 'primary', size: 'lg' }) + ' glow-primary rounded-full'}
                >
                  <SparkleIcon />
                  Yeni coin paketi al
                </Link>
                <Link
                  href="/coin-qazan"
                  className={buttonVariants({ variant: 'outline', size: 'lg' }) + ' rounded-full border-navy/25 text-navy hover:bg-navy/5'}
                >
                  <CoinIcon />
                  Coin qazan
                </Link>
              </div>
            </div>
          ) : null}

          {transferForm}

          {transferHistoryList}

          <div id="security" className="scroll-mt-24">
            {securityForms}
          </div>

          <div className="space-y-4 rounded-3xl border border-error/30 bg-error/5 p-6 md:p-10">
            <div className="flex items-center gap-3 border-b border-error/20 pb-4">
              <div className="flex size-10 items-center justify-center rounded-xl bg-error/15 text-error">
                <TrashIcon width={18} height={18} />
              </div>
              <h2 className="text-[20px] font-semibold text-navy">Təhlükəli zona</h2>
            </div>

            {logoutForm}

            <p className="text-[14px] leading-relaxed text-on-surface-variant">
              Hesabınızı silmək geri qaytarıla bilməz — bütün söhbətləriniz və mesajlarınız itiriləcək.
            </p>
            {deleteAccountDialog}
          </div>

          <AdSlot />
          </div>

          <div className="mt-16">
            <Footer />
          </div>
        </div>
      }
      threeD={
        <AccountPage3D
          fullName={fullName}
          email={user.email ?? ''}
          avatarUrl={avatarUrl}
          initials={initialsFrom(fullName, user.email ?? '')}
          isAdmin={isAdmin}
          statTiles={statTiles.map((tile) => ({
            label: tile.label,
            value: tile.value,
            color:
              tile.accent === 'text-primary'
                ? 'var(--hud-primary)'
                : tile.accent === 'text-regulatory-blue'
                  ? 'var(--hud-cyan)'
                  : 'var(--hud-green)',
          }))}
          knowledgeLevelPercent={knowledgeLevelPercent}
          knowledgeLevelLabel={knowledgeLevelLabel}
          coins={coins ? { balance: coins.balance, msUntilResetLabel: formatMsUntilReset(coins.msUntilReset) } : null}
          streakDays={streakStatus?.current ?? 0}
          profileForm={profileForm}
          preferencesCard={preferencesCard}
          pushOptIn={pushOptIn}
          securityQuickView={securityQuickView}
          transferForm={transferForm}
          transferHistory={transferHistoryList}
          securityForms={securityForms}
          logoutForm={logoutForm}
          deleteAccountDialog={deleteAccountDialog}
        />
      }
    />
  );
}
