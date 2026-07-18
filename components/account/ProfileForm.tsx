'use client';

import { useActionState, useState } from 'react';
import { TextField, Label, Input, Description, Button, Alert, Avatar } from '@heroui/react';
import { updateProfile, type AccountFormState } from '@/app/account/actions';
import { Spinner } from '@/components/Spinner';
import { UserIcon } from '@/components/icons';

const initialState: AccountFormState = {};

function initialsFrom(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

interface ProfileFormProps {
  fullName: string;
  avatarUrl: string;
  email: string;
}

export default function ProfileForm({ fullName, avatarUrl, email }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);
  const [previewName, setPreviewName] = useState(fullName);
  const [previewAvatarUrl, setPreviewAvatarUrl] = useState(avatarUrl);

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3 border-b border-outline-variant/30 pb-4">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <UserIcon />
        </div>
        <h2 className="text-headline-md text-[18px]">Hesab Məlumatları</h2>
      </div>

      <form action={formAction} className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar size="lg" className="ring-2 ring-primary/20">
            {previewAvatarUrl ? <Avatar.Image src={previewAvatarUrl} alt="Profil şəkli" /> : null}
            <Avatar.Fallback>{initialsFrom(previewName || fullName)}</Avatar.Fallback>
          </Avatar>
          <p className="text-body-md text-on-surface-variant">Şəkil önizləməsi</p>
        </div>

        <TextField name="full_name" defaultValue={fullName} onChange={setPreviewName}>
          <Label>Tam Adınız</Label>
          <Input placeholder="Adınız və soyadınız" />
        </TextField>

        {/* Real data: e-poçt ünvanı auth.users-dən gəlir. Dəyişdirmək üçün ayrıca
            təsdiq axını lazımdır (bax SecurityForms/changeEmail), ona görə bu sahə
            read-only göstərilir — Stitch mockup-dakı "E-poçt Ünvanı" sahəsi ilə
            vizual paritet üçün saxlanılıb. */}
        <TextField isDisabled>
          <Label>E-poçt Ünvanı</Label>
          <Input value={email} readOnly />
          <Description>Email dəyişdirmək üçün aşağıdakı Təhlükəsizlik bölməsini istifadə edin</Description>
        </TextField>

        {/* Mock data: "profiles" cədvəlində telefon nömrəsi sahəsi yoxdur (bax
            supabase/migrations) — heç bir real telefon məlumatı saxlanmır və ya
            oxunmur. Bu sahə yalnız Stitch mockup-dakı "Telefon Nömrəsi" sahəsi ilə
            vizual paritet üçün göstərilir, deaktiv və submit olunmur. */}
        <TextField isDisabled>
          <Label>Telefon Nömrəsi</Label>
          <Input placeholder="+994 XX XXX XX XX" readOnly />
          <Description>Telefon nömrəsi funksiyası hələ mövcud deyil</Description>
        </TextField>

        <TextField name="avatar_url" defaultValue={avatarUrl} onChange={setPreviewAvatarUrl}>
          <Label>Profil şəkli linki</Label>
          <Input placeholder="https://..." />
          <Description>Tam şəkil URL-i olmalıdır (http:// və ya https:// ilə başlayaraq)</Description>
        </TextField>

        {state.error && (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{state.error}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        {state.success && (
          <Alert status="success">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{state.success}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        <Button type="submit" variant="primary" isPending={pending}>
          {({ isPending }) => (
            <>
              {isPending ? <Spinner size="sm" tone="current" /> : null}
              Yadda saxla
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
