// Mock data: no per-user "learned topics" / mastery tracking exists anywhere
// in the schema (supabase/migrations) or lib/ — chunks/documents are
// retrieval sources, not a per-user progress ledger. This entire section is
// a static, clearly-labeled placeholder to match the Stitch "Öyrənilən
// Mövzular" mockup per explicit user instruction (visual fidelity over
// only-real-data). If real per-topic progress tracking is ever built, this
// should be replaced with a data-backed component.
const MOCK_LEARNED_TOPICS = [
  {
    code: 'İXM',
    codeColor: 'bg-regulatory-blue/20 text-regulatory-blue',
    article: 'Maddə 327.1',
    title: 'Sürət həddinin aşılması',
    progress: 100,
    progressColor: 'bg-primary',
    status: 'Tamamlanıb',
    statusColor: 'text-primary',
  },
  {
    code: 'YHQ',
    codeColor: 'bg-caution-orange/20 text-caution-orange',
    article: 'Maddə 42',
    title: 'Yolayrıcının keçilməsi',
    progress: 65,
    progressColor: 'bg-safety-yellow',
    status: '65%',
    statusColor: 'text-on-surface-variant',
  },
  {
    code: 'İXM',
    codeColor: 'bg-go-green/20 text-go-green',
    article: 'Maddə 330',
    title: 'Dayanma və durma',
    progress: 20,
    progressColor: 'bg-secondary',
    status: '20%',
    statusColor: 'text-on-surface-variant',
  },
] as const;

export default function LearnedTopicsSection() {
  return (
    <section className="glass-panel rounded-3xl p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-headline-md text-on-surface">Öyrənilən Mövzular</h2>
        <span className="text-label-sm text-on-surface-variant">Tezliklə</span>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MOCK_LEARNED_TOPICS.map((topic) => (
          <div
            key={topic.article}
            className="rounded-2xl border border-white/5 bg-white/5 p-4 transition-all"
          >
            <div className="mb-2 flex items-center gap-3">
              <span className={`rounded px-2 py-1 text-[10px] font-bold ${topic.codeColor}`}>{topic.code}</span>
              <span className="text-legal-citation text-on-surface-variant">{topic.article}</span>
            </div>
            <h4 className="text-body-md font-bold text-on-surface">{topic.title}</h4>
            <div className="mt-4 flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-surface-tertiary">
                <div className={`h-full rounded-full ${topic.progressColor}`} style={{ width: `${topic.progress}%` }} />
              </div>
              <span className={`text-label-sm ${topic.statusColor}`}>{topic.status}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
