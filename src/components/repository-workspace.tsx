"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { RepositoryWorkspaceResponse } from "../server/repository-store";
import { ArchitectureSection } from "./workspace/architecture-section";
import { ErrorInvestigatorSection } from "./workspace/error-investigator-section";
import { ImportantFilesSection } from "./workspace/important-files-section";
import { OverviewSection } from "./workspace/overview-section";
import { RepositorySearchSection } from "./workspace/repository-search-section";

const SECTIONS = [
  { id: "overview", label: "Overview", glyph: "01" },
  { id: "architecture", label: "Architecture", glyph: "02" },
  { id: "important", label: "Important Files", glyph: "03" },
  { id: "search", label: "Repository Search", glyph: "04" },
  { id: "errors", label: "Error Investigator", glyph: "05" },
] as const;
type SectionId = typeof SECTIONS[number]["id"];

export function RepositoryWorkspace() {
  const params = useParams<{ id: string }>();
  const [workspace, setWorkspace] = useState<RepositoryWorkspaceResponse | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/repositories/${params.id}`, { signal: controller.signal })
      .then(async (response) => {
        const payload: unknown = await response.json();
        if (!response.ok || !isWorkspaceResponse(payload)) throw new Error(readError(payload));
        return payload;
      })
      .then(setWorkspace)
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Analysis unavailable."); });
    return () => controller.abort();
  }, [params.id]);

  if (error !== null) return <WorkspaceFailure message={error} />;
  if (workspace === null) return <WorkspaceLoading />;

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#070b0f]/90 backdrop-blur-xl">
        <div className="shell flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 no-underline"><span className="brand-mark !h-8 !w-8 !text-xs">CN</span><span className="hidden text-sm font-bold sm:block">Codex Navigator</span></Link>
          <div className="min-w-0 text-center"><div className="mono truncate text-sm text-slate-200">{workspace.repository.owner}/{workspace.repository.name}</div><div className="mt-0.5 flex items-center justify-center gap-2 text-[10px] uppercase tracking-wider text-slate-600"><span className="status-dot !h-1.5 !w-1.5" />Analysis ready</div></div>
          <div className="flex gap-2">
            {workspace.repository.sourceType === "github" && workspace.repository.sourceUrl !== null
              ? <a className="button-secondary hidden sm:inline-flex" href={workspace.repository.sourceUrl} target="_blank" rel="noreferrer">GitHub ↗</a>
              : <span className="badge badge-accent hidden sm:inline-flex">Demo Repository</span>}
            <Link className="button-secondary no-underline" href="/">New analysis</Link>
          </div>
        </div>
      </header>

      <div className="shell grid gap-7 py-7 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <nav className="flex gap-2 overflow-x-auto pb-2 lg:flex-col" aria-label="Analysis sections" role="tablist">
            {SECTIONS.map((section) => <button key={section.id} type="button" role="tab" aria-selected={activeSection === section.id} aria-controls={`panel-${section.id}`} onClick={() => setActiveSection(section.id)} className={`flex shrink-0 items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${activeSection === section.id ? "border-emerald-800/50 bg-emerald-950/25 text-emerald-200" : "border-transparent text-slate-500 hover:border-slate-800 hover:bg-slate-900/40 hover:text-slate-300"}`}><span className="mono text-[10px] text-slate-700">{section.glyph}</span>{section.label}</button>)}
          </nav>
          <div className="panel mt-5 hidden p-4 text-xs leading-5 text-slate-600 lg:block"><div className="mb-2 flex items-center gap-2 font-semibold text-slate-400"><span aria-hidden="true">◇</span> Safe snapshot</div>{workspace.analysis.files.length} files indexed. Imported code was filtered and never executed.</div>
        </aside>

        <div className="min-w-0">
          <div id="panel-overview" role="tabpanel" hidden={activeSection !== "overview"}><OverviewSection workspace={workspace} /></div>
          <div id="panel-architecture" role="tabpanel" hidden={activeSection !== "architecture"}><ArchitectureSection architecture={workspace.analysis.architecture} /></div>
          <div id="panel-important" role="tabpanel" hidden={activeSection !== "important"}><ImportantFilesSection repositoryId={workspace.repository.id} files={workspace.analysis.importantFiles} /></div>
          <div id="panel-search" role="tabpanel" hidden={activeSection !== "search"}><RepositorySearchSection repositoryId={workspace.repository.id} /></div>
          <div id="panel-errors" role="tabpanel" hidden={activeSection !== "errors"}><ErrorInvestigatorSection repositoryId={workspace.repository.id} /></div>
        </div>
      </div>
    </main>
  );
}

function WorkspaceLoading() {
  return <main className="shell py-20" aria-busy="true"><div className="mb-10 flex items-center gap-3"><span className="brand-mark">CN</span><div><div className="skeleton h-4 w-40"/><div className="skeleton mt-2 h-2 w-24"/></div></div><div className="grid gap-6 lg:grid-cols-[220px_1fr]"><div className="skeleton h-64"/><div className="space-y-4"><div className="skeleton h-10 w-56"/><div className="skeleton h-52"/><div className="grid grid-cols-3 gap-4"><div className="skeleton h-32"/><div className="skeleton h-32"/><div className="skeleton h-32"/></div></div></div><span className="sr-only">Loading repository analysis</span></main>;
}

function WorkspaceFailure({ message }: Readonly<{ message: string }>) {
  return <main className="shell grid min-h-screen place-items-center py-16"><div className="panel-raised max-w-lg p-8 text-center"><span className="brand-mark mx-auto mb-5">!</span><h1 className="text-2xl font-semibold">Analysis unavailable</h1><p className="mt-3 leading-7 text-slate-400">{message}</p><Link href="/" className="button-primary mt-5 no-underline">Analyze another repository</Link></div></main>;
}

function isWorkspaceResponse(value: unknown): value is RepositoryWorkspaceResponse {
  return typeof value === "object" && value !== null && "repository" in value && "analysis" in value;
}
function readError(value: unknown): string {
  if (typeof value === "object" && value !== null && "error" in value && typeof value.error === "object" && value.error !== null && "message" in value.error && typeof value.error.message === "string") return value.error.message;
  return "The local analysis is unavailable or has expired.";
}
