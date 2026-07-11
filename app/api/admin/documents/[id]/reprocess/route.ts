import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { reprocessDocument } from '@/lib/ingestion/ingestDocument';
import { apiError, serverError } from '@/lib/api/errors';

export const maxDuration = 300;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { id } = await params;

  // Unlike ingest-on-upload, this is fully awaited before responding (not a
  // detached background job), so a failure here should be surfaced to the
  // caller rather than returning a false ok:true.
  try {
    await reprocessDocument(id);
  } catch (err) {
    return serverError(err, 'Sənədi yenidən emal etmək uğursuz oldu');
  }

  return NextResponse.json({ ok: true });
}
