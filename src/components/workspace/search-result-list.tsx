import type { SearchResult } from "../../domain/repository-analysis";

export function SearchResultList({ results }: Readonly<{ results: readonly SearchResult[] }>) {
  if (results.length === 0) return <div className="empty-state">No relevant files met the lexical relevance threshold.</div>;
  return (
    <div className="space-y-3">
      {results.map((result, index) => (
        <article key={result.path} className="panel overflow-hidden">
          <header className="flex flex-col gap-3 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3"><span className="mono grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-800 text-xs text-slate-400">{index + 1}</span><code className="mono truncate text-sm text-slate-200">{result.path}</code></div>
            <div className="flex shrink-0 gap-2"><span className={`badge ${result.confidence === "high" ? "badge-accent" : ""}`}>{result.confidence} confidence</span><span className="badge mono">{result.score} pts</span></div>
          </header>
          <div className="grid lg:grid-cols-[280px_1fr]">
            <div className="border-b border-slate-800 p-4 lg:border-b-0 lg:border-r">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">Why this file</div>
              <ul className="m-0 space-y-2 pl-4 text-xs leading-5 text-slate-500">{result.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </div>
            <div className="min-w-0 p-3">
              {result.excerpts.map((excerpt) => (
                <div className="code-block mb-2 last:mb-0" key={`${excerpt.startLine}-${excerpt.endLine}`}>
                  <div className="border-b border-slate-800 px-3 py-1.5 text-[10px] text-slate-600">Lines {excerpt.startLine}–{excerpt.endLine}</div>
                  <pre className="m-0 whitespace-pre-wrap break-words p-3">{excerpt.text}</pre>
                </div>
              ))}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
