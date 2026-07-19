import { redirect, notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@/lib/supabase/server';
import { slugToCategory } from '@/lib/content/ruleCategories';
import { getLessonQuestions } from '@/lib/quiz/lessons';
import LessonRunner from './LessonRunner';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = slugToCategory(slug);
  return { title: category ?? 'Dərs' };
}

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = slugToCategory(slug);
  if (!category) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const questions = await getLessonQuestions(category, user.id);

  return <LessonRunner category={category} questions={questions} />;
}
