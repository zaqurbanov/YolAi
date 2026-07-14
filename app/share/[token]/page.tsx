import type { Metadata } from 'next';
import { getSharedConversation, type SharedConversationMessage } from '@/lib/chat/getSharedConversation';
import { renderCitationText } from '@/lib/chat/renderCitationText';
import { Chip } from '@heroui/react';

interface Citation {
  document_id: string;
  title: string;
  page: number | null;
  article_label: string | null;
}

const timeFormatter = new Intl.DateTimeFormat('az-AZ', { hour: '2-digit', minute: '2-digit' });

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
  return {
    title: conversation?.title ?? 'Paylaşılan söhbət',
  };
}

export default async function SharedConversationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const conversation = await getSharedConversation(token);

  if (!conversation) {
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
                  {isUser ? 'Sən' : 'Yol AI'} · {timeFormatter.format(new Date(message.created_at))}
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
