import type { DetectionResult } from "../../domain/repository-analysis";

export function DetectionGroup({ title, items, empty = "Not detected" }: Readonly<{ title: string; items: readonly DetectionResult[]; empty?: string }>) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/25 p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-[.12em] text-slate-500">{title}</h3>
      {items.length === 0 ? <p className="m-0 text-sm text-slate-600">{empty}</p> : (
        <div className="space-y-3">
          {items.map((item) => (
            <details key={item.name} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm text-slate-200">
                <span>{item.name}</span><span className="badge !min-h-5 !px-2 !text-[10px]">{item.confidence}</span>
              </summary>
              <ul className="mt-2 space-y-1 border-l border-slate-800 pl-3 text-xs text-slate-500">
                {item.evidence.slice(0, 4).map((evidence) => <li key={`${evidence.path}-${evidence.detail}`}><span className="mono text-slate-400">{evidence.path}</span> — {evidence.detail}</li>)}
              </ul>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
