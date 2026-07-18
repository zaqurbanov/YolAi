import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Avatar, Chip, Button } from '@heroui/react';
import { buttonVariants } from '@heroui/styles';
import { SparkleIcon, CoinIcon, TrashIcon, LogoutIcon, CheckIcon } from '@/components/icons';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/app/(auth)/actions';
import { getAccountStats } from '@/lib/account/getAccountStats';
import { getCoinBalanceStatus } from '@/lib/chat/coins';
import { getTransferMinAmount, getTransferHistory } from '@/lib/coins/transfers';
import { getQuizRewardAmount, hasClaimedToday } from '@/lib/coins/quiz';
import { getDailyQuestionForUser } from '@/lib/quiz/questions';
import { formatAzDate } from '@/lib/format/date';
import { formatMsUntilReset } from '@/lib/format/coins';
import AdSlot from '@/components/AdSlot';
import ProfileForm from '@/components/account/ProfileForm';
import SecurityForms from '@/components/account/SecurityForms';
import DeleteAccountDialog from '@/components/account/DeleteAccountDialog';
import TransferCoinsForm from '@/components/account/TransferCoinsForm';
import TransferHistoryList from '@/components/account/TransferHistoryList';
import DailyQuizCard from '@/components/account/DailyQuizCard';
import PreferencesCard from '@/components/account/PreferencesCard';
import SecurityQuickView from '@/components/account/SecurityQuickView';
import LearnedTopicsSection from '@/components/account/LearnedTopicsSection';

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

  const [transferMinAmount, transferHistory, quizReward, quizAlreadyClaimed] = isAdmin
    ? [null, null, null, null]
    : await Promise.all([
        getTransferMinAmount(),
        getTransferHistory(user.id),
        getQuizRewardAmount(),
        hasClaimedToday(user.id),
      ]);

  // Strip correctIndex before it ever reaches the client component's props —
  // the server action re-derives it server-side from (userId, today) when
  // the answer is submitted.
  const dailyQuestion = isAdmin ? null : getDailyQuestionForUser(user.id, new Date());
  const quizQuestionForClient = dailyQuestion
    ? { question: dailyQuestion.question, options: dailyQuestion.options }
    : null;

  const statTiles = [
    { label: 'Söhbətlər', value: stats.conversations, accent: 'text-primary' },
    { label: 'Mesajlar', value: stats.messages, accent: 'text-regulatory-blue' },
    { label: 'Üzv olub', value: memberSince, accent: 'text-go-green' },
  ];

  // Mock data: "Hüquqi Bilik Səviyyəsi" (legal-knowledge mastery %) has no
  // backing metric anywhere in the schema/lib — there is no per-user
  // "topics learned" or quiz-mastery ledger (the daily quiz below only
  // tracks today's single claim, not cumulative mastery). Fixed placeholder
  // value + label, matching the Stitch mockup's "Expert / 85%" bar, per
  // explicit user instruction to keep the section rather than drop it.
  const MOCK_KNOWLEDGE_LEVEL_PERCENT = 85;
  const MOCK_KNOWLEDGE_LEVEL_LABEL = 'Expert';

  return (
    <div className="space-y-8 px-4 pt-8 pb-16 md:px-8">
      <section className="glass-panel relative grid grid-cols-1 gap-6 overflow-hidden rounded-3xl p-6 md:grid-cols-12 md:items-center md:gap-8 md:p-8">
        <div className="pointer-events-none absolute -top-20 -right-20 size-64 rounded-full bg-primary/10 blur-[100px]" />

        <div className="relative z-10 flex flex-col items-center gap-4 text-center md:col-span-4 md:items-start md:text-left">
          <div className="relative">
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
            <h1 className="truncate text-headline-md text-on-surface">{fullName || user.email}</h1>
            <p className="truncate text-body-md text-on-surface-variant">{user.email}</p>
            <div className="mt-2 flex justify-center md:justify-start">
              {isAdmin ? (
                <Chip color="accent" variant="soft">
                  Admin
                </Chip>
              ) : (
                <Chip variant="soft">İstifadəçi</Chip>
              )}
            </div>
          </div>
        </div>

        <div className="relative z-10 md:col-span-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {statTiles.map((tile) => (
              <div key={tile.label} className="glass-card rounded-2xl p-4">
                <div className="text-label-sm uppercase text-on-surface-variant">{tile.label}</div>
                <div className={`mt-2 text-headline-md ${tile.accent}`}>{tile.value}</div>
              </div>
            ))}
          </div>

          <div className="col-span-full mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-label-sm text-on-surface-variant">Hüquqi Bilik Səviyyəsi</span>
              <span className="text-label-sm text-go-green">{MOCK_KNOWLEDGE_LEVEL_LABEL}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-tertiary">
              <div
                className="h-full rounded-full bg-go-green shadow-[0_0_10px_rgba(34,197,94,0.4)]"
                style={{ width: `${MOCK_KNOWLEDGE_LEVEL_PERCENT}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <ProfileForm fullName={fullName} avatarUrl={avatarUrl} email={user.email ?? ''} />
        <div className="flex flex-col gap-6">
          <PreferencesCard />
          <SecurityQuickView lastSignInAt={user.last_sign_in_at ?? null} />
        </div>
      </div>

      {coins ? (
        <div className="glass-card rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-safety-yellow/15 text-safety-yellow">
              <CoinIcon />
            </div>
            <h2 className="text-headline-md text-[18px]">Gündəlik limit</h2>
          </div>
          <div className="mt-4 text-body-lg text-on-surface">
            Qalan coin: <span className="font-semibold text-safety-yellow">{coins.balance}</span>
          </div>
          <div className="mt-1 text-body-md text-on-surface-variant">
            Sıfırlanmaya qalan vaxt: {formatMsUntilReset(coins.msUntilReset)}
          </div>
          <Link
            href="/qiymetler"
            className={buttonVariants({ variant: 'primary', size: 'sm' }) + ' glow-primary mt-4 gap-1.5'}
          >
            <SparkleIcon />
            Yeni coin paketi al
          </Link>
        </div>
      ) : null}

      {quizQuestionForClient ? (
        <DailyQuizCard
          question={quizQuestionForClient.question}
          options={quizQuestionForClient.options}
          alreadyClaimed={quizAlreadyClaimed ?? false}
          reward={quizReward ?? 0}
        />
      ) : null}

      {transferMinAmount != null ? <TransferCoinsForm minAmount={transferMinAmount} /> : null}

      {transferHistory ? (
        <TransferHistoryList sent={transferHistory.sent} received={transferHistory.received} />
      ) : null}

      <LearnedTopicsSection />

      <div id="security" className="scroll-mt-24">
        <SecurityForms />
      </div>

      <div className="space-y-4 rounded-2xl border border-error/30 bg-error-container/10 p-6">
        <div className="flex items-center gap-3 border-b border-error/20 pb-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-error/15 text-error">
            <TrashIcon width={18} height={18} />
          </div>
          <h2 className="text-headline-md text-[18px] text-error">Təhlükəli zona</h2>
        </div>

        <form action={logout}>
          <Button type="submit" variant="danger" className="gap-2">
            <LogoutIcon width={18} height={18} />
            Hesabdan çıxış et
          </Button>
        </form>

        <p className="text-body-md text-on-surface-variant">
          Hesabınızı silmək geri qaytarıla bilməz — bütün söhbətləriniz və mesajlarınız itiriləcək.
        </p>
        <DeleteAccountDialog />
      </div>

      <AdSlot />
    </div>
  );
}
