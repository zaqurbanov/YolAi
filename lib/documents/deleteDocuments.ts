import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logApiError } from '@/lib/api/errors';

export async function deleteDocuments(supabase: SupabaseClient, ids: string[]) {
  const { data: documents, error: fetchError } = await supabase
    .from('documents')
    .select('id, storage_path')
    .in('id', ids);
  if (fetchError) throw fetchError;

  const paths = (documents ?? []).map((doc) => doc.storage_path);
  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from('documents').remove(paths);
    if (storageError) {
      logApiError(`storage delete documents=${ids.join(',')}`, storageError);
    }
  }

  // .delete() doesn't reliably report affected row count without a select,
  // and ids.length is the caller-intended count regardless of how many already existed.
  const { error: deleteError } = await supabase.from('documents').delete().in('id', ids);
  if (deleteError) throw deleteError;

  return { deletedCount: ids.length };
}
