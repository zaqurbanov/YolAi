import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { Avatar, Chip, Button } from '@heroui/react';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/app/(auth)/actions';
import { getAccountStats } from '@/lib/account/getAccountStats';
import { getChatQuotaStatus } from '@/lib/chat/rateLimit';
import AdSlot from '@/components/AdSlot';
import ProfileForm from '@/components/account/ProfileForm';
import SecurityForms from '@/components/account/SecurityForms';
import DeleteAccountDialog from '@/components/account/DeleteAccountDialog';

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
    .select('role, full_name, avatar_url, created_at, custom_max_per_day')
    .eq('id', user.id)
    .single();

  const stats = await getAccountStats();

  const fullName = profile?.full_name ?? '';
  const avatarUrl = profile?.avatar_url ?? '';
  const isAdmin = profile?.role === 'admin';
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('az-AZ', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';

  const quota = isAdmin ? null : await getChatQuotaStatus(user.id, profile?.custom_max_per_day ?? null);

  const statTiles = [
    { label: 'Söhbətlər', value: stats.conversations },
    { label: 'Mesajlar', value: stats.messages },
    { label: 'Üzv olub', value: memberSince },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 pt-6 pb-12">
      <div className="glass-panel flex items-center gap-4 rounded-2xl p-6">
        <Avatar size="lg">
          {avatarUrl ? <Avatar.Image src={avatarUrl} alt="Profil şəkli" /> : null}
          <Avatar.Fallback>{initialsFrom(fullName, user.email ?? '')}</Avatar.Fallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-semibold text-on-surface">
            {fullName || user.email}
          </h1>
          <p className="truncate text-sm text-on-surface-variant">{user.email}</p>
          <div className="mt-2">
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statTiles.map((tile) => (
          <div key={tile.label} className="glass-card rounded-2xl p-4">
            <div className="mono-label uppercase text-on-surface-variant">{tile.label}</div>
            <div className="mt-2 text-2xl font-semibold text-on-surface">{tile.value}</div>
          </div>
        ))}
      </div>

      {quota ? (
        <div className="glass-card rounded-2xl p-4">
          <div className="mono-label uppercase text-on-surface-variant">Gündəlik limit</div>
          <div className="mt-2 text-sm text-on-surface">
            Bugünkü mesaj limiti: {quota.used}/{quota.max} istifadə olunub
          </div>
        </div>
      ) : null}

      <ProfileForm fullName={fullName} avatarUrl={avatarUrl} />

      <SecurityForms />

      <div className="rounded-2xl border border-error/40 bg-error-container/10 p-6 space-y-4">
        <div>
          <h2 className="mono-label uppercase text-error">Təhlükəli zona</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Hesabınızı silmək geri qaytarıla bilməz — bütün söhbətləriniz və mesajlarınız itiriləcək.
          </p>
        </div>
        <DeleteAccountDialog />
      </div>

      <AdSlot />

      <form action={logout}>
        <Button type="submit" variant="secondary">
          Çıxış et
        </Button>
      </form>
    </div>
  );
}
