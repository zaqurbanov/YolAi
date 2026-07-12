'use client';

import { useActionState, useState } from 'react';
import { TextField, Label, Input, Description, Button, Alert, Avatar } from '@heroui/react';
import { updateProfile, type AccountFormState } from '@/app/account/actions';
import { Spinner } from '@/components/Spinner';

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
}

export default function ProfileForm({ fullName, avatarUrl }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(updateProfile, initialState);
  const [previewName, setPreviewName] = useState(fullName);
  const [previewAvatarUrl, setPreviewAvatarUrl] = useState(avatarUrl);

  return (
    <div className="glass-card rounded-2xl p-6 space-y-4">
      <h2 className="mono-label uppercase text-on-surface-variant">Profil</h2>

      <form action={formAction} className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar size="lg">
            {previewAvatarUrl ? <Avatar.Image src={previewAvatarUrl} alt="Profil şəkli" /> : null}
            <Avatar.Fallback>{initialsFrom(previewName || fullName)}</Avatar.Fallback>
          </Avatar>
          <p className="text-sm text-on-surface-variant">Şəkil önizləməsi</p>
        </div>

        <TextField name="full_name" defaultValue={fullName} onChange={setPreviewName}>
          <Label>Ad Soyad</Label>
          <Input placeholder="Adınız və soyadınız" />
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
