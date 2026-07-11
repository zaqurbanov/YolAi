import { redirect } from 'next/navigation';
import { Card, Button, Chip } from '@heroui/react';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/app/(auth)/actions';
import AdSlot from '@/components/AdSlot';

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  return (
    <div className="max-w-md mx-auto mt-8 px-4 space-y-6">
      <h1 className="text-2xl font-semibold">Hesabım</h1>

      <Card>
        <Card.Content className="space-y-1">
          <p className="text-sm text-muted">Email</p>
          <p className="font-medium">{user.email}</p>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content className="flex items-center justify-between">
          <p className="text-sm text-muted">Plan</p>
          <Chip>Free</Chip>
        </Card.Content>
      </Card>

      <AdSlot />

      <form action={logout}>
        <Button type="submit" variant="secondary">
          Çıxış et
        </Button>
      </form>
    </div>
  );
}
