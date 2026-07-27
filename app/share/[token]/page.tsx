import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonVariants } from '@heroui/styles';
import { getSharedConversation, type SharedConversationMessage } from '@/lib/chat/getSharedConversation';
import { getSharedExamResult } from '@/lib/exam/examShare';
import { renderCitationText } from '@/lib/chat/renderCitationText';
import { formatAzTime } from '@/lib/format/date';
import { Chip } from '@heroui/react';

// Same cosmetic pass threshold as components/games/ExamSimulatorGame.tsx —
// frontend badge only, not enforced server-side (see that file's comment).
// No shared constants file exists for this yet; duplicated deliberately.
const EXAM_PASS_THRESHOLD = 8;

interface Citation {
  document_id: string;
  title: string;
  page: number | null;
  article_label: string | null;
}

function citationsOf(message: SharedConversationMessage): Citation[] {
  return Array.isArray(message.citations) ? (message.citations as Citation[]) : [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const conversation = await getSharedConversation(token);
  if (conversation) {
    return { title: conversation.title ?? 'Paylaşılan söhbət' };
  }

  const examResult = await getSharedExamResult(token);
  if (examResult) {
    return { title: 'Sınaq İmtahanı Nəticəsi' };
  }

  return { title: 'Paylaşılan söhbət' };
}

export default async function SharedConversationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const conversation = await getSharedConversation(token);

  if (!conversation) {
    const examResult = await getSharedExamResult(token);
    if (examResult) {
      const passed = examResult.score >= EXAM_PASS_THRESHOLD;
      return (
        <div className="flex flex-1 items-center justify-center px-4 py-16">
          <div className="glass-card flex max-w-md flex-col items-center gap-4 rounded-2xl px-6 py-8 text-center">
            <Chip size="sm" variant="soft" color="accent">
              Sınaq İmtahanı Nəticəsi
            </Chip>
            <p className="text-headline-md text-on-surface">
              {examResult.score}/{examResult.total}
            </p>
            <Chip color={passed ? 'success' : 'danger'} variant="soft">
              {passed ? 'Keçdin!' : 'Keçmədin'}
            </Chip>
            <Link
              href="/coin-qazan"
              className={buttonVariants({ variant: 'primary', size: 'md' }) + ' glow-primary'}
            >
              Sən də özünü yoxla
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="glass-card max-w-md rounded-2xl px-6 py-8 text-center">
          <p className="text-sm text-on-surface-variant">
            Bu paylaşım linki tapılmadı və ya artıq mövcud deyil.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <header className="glass-panel flex items-center gap-3 px-4 py-3 sm:px-8">
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-semibold text-on-surface">
            {conversation.title ?? 'Yol Hərəkəti Qaydaları üzrə sual-cavab'}
          </h1>
          <Chip size="sm" variant="soft" color="accent" className="mt-1">
            Paylaşılan söhbət
          </Chip>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="space-y-6">
          {conversation.messages.map((message) => {
            const isUser = message.role === 'user';
            const citations = citationsOf(message);
            return (
              <div key={message.id} className={`flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
                <div
                  className={
                    isUser
                      ? 'glow-primary max-w-[85%] rounded-2xl rounded-tr-none bg-primary px-4 py-3 text-sm text-on-primary'
                      : 'glass-panel max-w-[85%] rounded-2xl rounded-tl-none border-l-2 border-primary px-4 py-3 text-sm text-on-surface'
                  }
                >
                  <span className="whitespace-pre-wrap">{renderCitationText(message.content)}</span>
                </div>

                {!isUser && citations.length > 0 && (
                  <div className="flex max-w-[85%] flex-wrap gap-1.5">
                    {citations.map((c, i) => (
                      <Chip key={i} size="sm" variant="soft" color="accent" className="mono-label">
                        {c.title}
                        {c.article_label ? ` · ${c.article_label}` : ''}
                        {c.page ? ` · s.${c.page}` : ''}
                      </Chip>
                    ))}
                  </div>
                )}

                <span className="mono-label px-1 uppercase text-on-surface-variant">
                  {isUser ? 'Sən' : 'Yol AI'} · {formatAzTime(message.created_at)}
                </span>
              </div>
            );
          })}

          {conversation.messages.length === 0 && (
            <div className="glass-card mx-auto max-w-md rounded-2xl px-6 py-8 text-center">
              <p className="text-sm text-on-surface-variant">Bu söhbətdə hələ mesaj yoxdur.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
