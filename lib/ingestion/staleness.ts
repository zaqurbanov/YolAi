import 'server-only';

// Large PDF ingestion should complete well within this window; a document
// still at status='processing' past it is presumed stuck because the
// process was killed mid-ingestion (SIGKILL/crash/dev-server-restart),
// which skips ingestDocument.ts's catch block entirely and never sets
// status='failed'. Read-time only — no background sweeper.
export const STALE_PROCESSING_MS = 20 * 60 * 1000;

export function isStaleProcessing(status: string, updatedAt: string): boolean {
  if (status !== 'processing') return false;
  return Date.now() - new Date(updatedAt).getTime() > STALE_PROCESSING_MS;
}
