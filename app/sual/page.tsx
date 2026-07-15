import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { getUserQuestions } from '@/lib/admin/questions';
import SualForm from '@/components/sual/SualForm';
import QuestionHistoryList from '@/components/sual/QuestionHistoryList';

export const metadata: Metadata = {
  title: 'Sual-Cavab',
};

export default async function SualPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const questions = await getUserQuestions(user.id);

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 pt-6 pb-12">
      <div>
        <h1 className="font-display text-2xl font-semibold text-on-surface">Sual-Cavab</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Admin komandasına birbaşa sual göndərin, cavab gəldikdə bildiriş alacaqsınız.
        </p>
      </div>

      <SualForm />

      <QuestionHistoryList questions={questions} />
    </div>
  );
}
