import Link from 'next/link';
import type { ReactNode } from 'react';
import RoadShaderBackground from '@/components/design3d/RoadShaderBackground';
import { CheckIcon, CoinIcon, FlameIcon, SparkleIcon, TrashIcon } from '@/components/icons';

interface StatTile {
  label: string;
  value: string | number;
  color: string;
}

interface CoinsSummary {
  balance: number;
  msUntilResetLabel: string;
}

interface AccountPage3DProps {
  fullName: string;
  email: string;
  avatarUrl: string;
  initials: string;
  isAdmin: boolean;
  statTiles: StatTile[];
  knowledgeLevelPercent: number;
  knowledgeLevelLabel: string;
  coins: CoinsSummary | null;
  streakDays: number;
  profileForm: ReactNode;
  preferencesCard: ReactNode;
  pushOptIn: ReactNode;
  securityQuickView: ReactNode;
  transferForm: ReactNode;
  transferHistory: ReactNode;
  securityForms: ReactNode;
  logoutForm: ReactNode;
  deleteAccountDialog: ReactNode;
}

// Same wrapper technique as CoinQazanPage3D's HudFrame: this component only
// supplies the "Cyber-Circuit Legal" chrome (gold border, mono-label header)
// around content that is either built directly here (profile hero, coin
// card — presentational, this file fully owns them) or mounted UNCHANGED as
// a ReactNode prop from app/account/page.tsx (ProfileForm, SecurityForms,
// TransferCoinsForm, ... — stateful client components, too deep to fork).
function HudFrame({
  label,
  children,
  className,
  borderColor = 'var(--hud-primary)',
}: {
  label: string;
  children: ReactNode;
  className?: string;
  borderColor?: string;
}) {
  return (
    <div
      className={`hud-glass relative flex flex-col gap-3 overflow-hidden rounded-2xl border-l-4 p-1 sm:p-1.5 ${className ?? ''}`}
      style={{ borderColor }}
    >
      <div className="flex items-center gap-2 px-4 pt-3" style={{ fontFamily: 'var(--hud-font-mono)' }}>
        <span className="size-1.5 rounded-full" style={{ background: borderColor }} />
        <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: borderColor }}>
          {label}
        </span>
      </div>
      {/* Inner content (ProfileForm, SecurityForms, TransferCoinsForm, ...)
          keeps its own "sadə dizayn" `glass-card`/`glass-panel` classes —
          `.account-hud-cards` scopes a HUD repaint onto those existing
          classes (same technique as `.chat-hud-shell .glass-panel` /
          `.coinqazan-hud-cards .glass-card`) instead of forking each child
          into a second JSX tree. See app/globals.css. */}
      <div className="account-hud-cards px-1 pb-1 sm:px-1.5 sm:pb-1.5">{children}</div>
    </div>
  );
}

export default function AccountPage3D({
  fullName,
  email,
  avatarUrl,
  initials,
  isAdmin,
  statTiles,
  knowledgeLevelPercent,
  knowledgeLevelLabel,
  coins,
  streakDays,
  profileForm,
  preferencesCard,
  pushOptIn,
  securityQuickView,
  transferForm,
  transferHistory,
  securityForms,
  logoutForm,
  deleteAccountDialog,
}: AccountPage3DProps) {
  return (
    <div
      className="relative flex flex-1 flex-col px-4 pt-8 pb-16 md:px-8"
      style={{ color: 'var(--hud-on-surface)', fontFamily: 'var(--hud-font-body)' }}
    >
      {/* Same fixed shader backdrop + legibility veil as HomePage3D/CoinQazanPage3D. */}
      <div className="fixed inset-0 -z-20" style={{ background: 'var(--hud-bg-deep)' }} aria-hidden="true">
        <RoadShaderBackground className="absolute inset-0 h-full w-full" />
      </div>
      <div
        className="fixed inset-0 -z-10"
        style={{ background: 'color-mix(in oklab, var(--hud-bg-deep) 55%, transparent)' }}
        aria-hidden="true"
      />

      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-6">
        {/* ---------- Profile hero ---------- */}
        <div
          className="hud-glass relative flex flex-col gap-6 overflow-hidden rounded-2xl border-l-4 p-6 md:flex-row md:items-center md:gap-8 md:p-8"
          style={{ borderColor: 'var(--hud-primary)' }}
        >
          <div className="flex flex-col items-center gap-4 text-center md:items-start md:text-left">
            <div className="relative">
              <div
                className="flex size-20 items-center justify-center overflow-hidden rounded-full text-xl font-bold"
                style={{
                  background: 'color-mix(in oklab, var(--hud-primary) 15%, transparent)',
                  color: 'var(--hud-primary)',
                  boxShadow: '0 0 0 2px color-mix(in oklab, var(--hud-primary) 30%, transparent)',
                }}
              >
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="Profil şəkli" className="size-full object-cover" />
                ) : (
                  initials
                )}
              </div>
              <div
                className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border-2"
                style={{ borderColor: 'var(--hud-bg-deep)', background: 'var(--hud-green)', color: 'var(--hud-bg-deep)' }}
              >
                <CheckIcon width={12} height={12} strokeWidth={3} />
              </div>
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold" style={{ fontFamily: 'var(--hud-font-display)' }}>
                {fullName || email}
              </h1>
              <p className="truncate text-sm" style={{ color: 'var(--hud-on-surface-variant)' }}>
                {email}
              </p>
              <div className="mt-2 flex justify-center md:justify-start">
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest"
                  style={
                    isAdmin
                      ? { background: 'color-mix(in oklab, var(--hud-cyan) 18%, transparent)', color: 'var(--hud-cyan)' }
                      : { background: 'color-mix(in oklab, var(--hud-primary) 15%, transparent)', color: 'var(--hud-primary)' }
                  }
                >
                  {isAdmin ? 'Admin' : 'İstifadəçi'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex-1">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {statTiles.map((tile) => (
                <div
                  key={tile.label}
                  className="hud-glass rounded-xl p-4"
                  style={{ borderColor: 'var(--hud-border)' }}
                >
                  <div
                    className="text-[11px] font-bold uppercase tracking-widest"
                    style={{ fontFamily: 'var(--hud-font-mono)', color: 'var(--hud-on-surface-variant)' }}
                  >
                    {tile.label}
                  </div>
                  <div className="mt-2 text-xl font-bold" style={{ color: tile.color }}>
                    {tile.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--hud-on-surface-variant)' }}>
                  Hüquqi Bilik Səviyyəsi
                </span>
                <span className="text-xs font-bold" style={{ color: 'var(--hud-green)' }}>
                  {knowledgeLevelLabel}
                </span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full"
                style={{ background: 'color-mix(in oklab, var(--hud-on-surface) 12%, transparent)' }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${knowledgeLevelPercent}%`,
                    background: 'var(--hud-green)',
                    boxShadow: '0 0 10px color-mix(in oklab, var(--hud-green) 50%, transparent)',
                  }}
                />
              </div>
              {!isAdmin && (
                <div className="mt-3 text-right">
                  <Link href="/leaderboard" className="text-xs font-bold" style={{ color: 'var(--hud-primary)' }}>
                    Liderlik lövhəsinə bax →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ---------- Profile form + preferences/security column ---------- */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <HudFrame label="PROFİL MƏLUMATLARI">{profileForm}</HudFrame>
          <div className="flex flex-col gap-6">
            <HudFrame label="TƏNZİMLƏMƏLƏR">{preferencesCard}</HudFrame>
            <HudFrame label="BİLDİRİŞLƏR">{pushOptIn}</HudFrame>
            <HudFrame label="TƏHLÜKƏSİZLİK BAXIŞI">{securityQuickView}</HudFrame>
          </div>
        </div>

        {/* ---------- Coin / daily limit ---------- */}
        {coins ? (
          <div
            className="hud-glass flex flex-col gap-4 rounded-2xl border-l-4 p-6"
            style={{ borderColor: 'var(--hud-primary)' }}
          >
            <div className="flex items-center gap-3 border-b pb-4" style={{ borderColor: 'var(--hud-border)' }}>
              <div
                className="flex size-10 items-center justify-center rounded-xl"
                style={{ background: 'color-mix(in oklab, var(--hud-primary) 15%, transparent)', color: 'var(--hud-primary)' }}
              >
                <CoinIcon />
              </div>
              <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--hud-font-display)' }}>
                Gündəlik limit
              </h2>
            </div>
            <div className="text-base" style={{ color: 'var(--hud-on-surface)' }}>
              Qalan coin:{' '}
              <span className="font-bold" style={{ color: 'var(--hud-primary)' }}>
                {coins.balance}
              </span>
            </div>
            <div className="-mt-2 text-sm" style={{ color: 'var(--hud-on-surface-variant)' }}>
              Sıfırlanmaya qalan vaxt: {coins.msUntilResetLabel}
            </div>
            {streakDays > 0 && (
              <div className="-mt-2 flex items-center gap-1.5 text-sm" style={{ color: 'var(--hud-red)' }}>
                <FlameIcon width={16} height={16} />
                <span>{streakDays} gün ardıcıl seriya</span>
              </div>
            )}
            <div className="flex flex-wrap gap-3">
              <Link
                href="/qiymetler"
                className="inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold transition-transform hover:scale-105 active:scale-95"
                style={{ background: 'var(--hud-primary)', color: 'var(--hud-on-primary)', boxShadow: '0 0 16px var(--hud-glow-primary)' }}
              >
                <SparkleIcon width={16} height={16} />
                Yeni coin paketi al
              </Link>
              <Link
                href="/coin-qazan"
                className="hud-glass inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-sm font-bold"
                style={{ color: 'var(--hud-primary)' }}
              >
                <CoinIcon width={16} height={16} />
                Coin qazan
              </Link>
            </div>
          </div>
        ) : null}

        {/* ---------- Transfers ---------- */}
        {transferForm ? <HudFrame label="COIN GÖNDƏR">{transferForm}</HudFrame> : null}
        {transferHistory ? <HudFrame label="TRANSFER TARİXÇƏSİ">{transferHistory}</HudFrame> : null}

        {/* ---------- Security forms ---------- */}
        <div id="security" className="scroll-mt-24">
          <HudFrame label="TƏHLÜKƏSİZLİK">{securityForms}</HudFrame>
        </div>

        {/* ---------- Danger zone — deliberately red, not gold ---------- */}
        <div
          className="hud-glass flex flex-col gap-4 rounded-2xl border-l-4 p-6"
          style={{ borderColor: 'var(--hud-red)' }}
        >
          <div className="flex items-center gap-3 border-b pb-4" style={{ borderColor: 'var(--hud-border)' }}>
            <div
              className="flex size-10 items-center justify-center rounded-xl"
              style={{ background: 'color-mix(in oklab, var(--hud-red) 18%, transparent)', color: 'var(--hud-red)' }}
            >
              <TrashIcon width={18} height={18} />
            </div>
            <h2 className="text-lg font-bold" style={{ color: 'var(--hud-red)', fontFamily: 'var(--hud-font-display)' }}>
              Təhlükəli zona
            </h2>
          </div>

          {logoutForm}

          <p className="text-sm" style={{ color: 'var(--hud-on-surface-variant)' }}>
            Hesabınızı silmək geri qaytarıla bilməz — bütün söhbətləriniz və mesajlarınız itiriləcək.
          </p>
          {deleteAccountDialog}
        </div>
      </div>
    </div>
  );
}
