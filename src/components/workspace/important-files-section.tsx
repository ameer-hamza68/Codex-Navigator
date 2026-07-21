import type { ImportantFile } from "../../domain/repository-analysis";
import { FileExcerpt } from "./file-excerpt";
import { SectionHeading } from "./section-heading";

export function ImportantFilesSection({ repositoryId, files }: Readonly<{ repositoryId: string; files: readonly ImportantFile[] }>) {
  const groups = files.reduce<Map<ImportantFile["category"], ImportantFile[]>>((result, file) => {
    result.set(file.category, [...(result.get(file.category) ?? []), file]);
    return result;
  }, new Map());
  return (
    <section>
      <SectionHeading eyebrow="Navigation shortlist" title="Important Files">High-signal files grouped by purpose, with deterministic scores and the evidence behind each selection.</SectionHeading>
      {files.length === 0 ? <div className="empty-state">No important files met the selection threshold.</div> : (
        <div className="space-y-6">
          {[...groups.entries()].map(([category, categoryFiles]) => (
            <div key={category}>
              <div className="mb-3 flex items-center gap-3"><h3 className="m-0 text-sm font-semibold capitalize text-slate-300">{category.replaceAll("-", " ")}</h3><span className="badge">{categoryFiles.length}</span></div>
              <div className="space-y-2">
                {categoryFiles.map((file) => (
                  <details className="panel group overflow-hidden" key={`${file.category}-${file.path}`}>
                    <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0"><div className="mono truncate text-sm text-slate-200">{file.path}</div><p className="mb-0 mt-1 text-sm text-slate-500">{file.explanation}</p></div>
                      <div className="flex shrink-0 items-center gap-2"><span className="badge badge-accent mono">{file.score} pts</span><span aria-hidden="true" className="text-slate-600 transition group-open:rotate-180">⌄</span></div>
                    </summary>
                    <div className="border-t border-slate-800 bg-slate-950/30 px-4 py-3">
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-600">Selection evidence</div>
                      <ul className="m-0 space-y-1 pl-4 text-xs text-slate-500">{file.evidence.map((item) => <li key={`${item.path}-${item.detail}`}>{item.detail}</li>)}</ul>
                    </div>
                    <FileExcerpt repositoryId={repositoryId} path={file.path} />
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
