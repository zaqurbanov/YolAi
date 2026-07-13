import { createAdminClient } from '@/lib/supabase/admin';
import { reprocessDocument } from '@/lib/ingestion/ingestDocument';

async function main() {
  const supabase = createAdminClient();
  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, title')
    .eq('status', 'ready');

  if (error) throw error;
  console.log(`Found ${docs.length} ready documents to reprocess.`);

  let success = 0;
  let failure = 0;
  const failures: { id: string; title: string; error: string }[] = [];

  for (const doc of docs) {
    process.stdout.write(`Reprocessing "${doc.title}" (${doc.id})... `);
    try {
      await reprocessDocument(doc.id);
      success += 1;
      console.log('OK');
    } catch (err) {
      failure += 1;
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ id: doc.id, title: doc.title, error: message });
      console.log('FAILED:', message);
    }
  }

  console.log(`\nTotal: ${docs.length}, Success: ${success}, Failure: ${failure}`);
  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures) {
      console.log(`  - ${f.title} (${f.id}): ${f.error}`);
    }
  }
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
