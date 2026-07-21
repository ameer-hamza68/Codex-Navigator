import { ImportForm } from "../components/import-form";

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <header className="shell flex h-20 items-center justify-between border-b border-slate-800/70">
        <a href="/" className="flex items-center gap-3 no-underline" aria-label="Codex Navigator home">
          <span className="brand-mark">CN</span>
          <span className="text-sm font-bold tracking-tight">Codex Navigator</span>
        </a>
        <span className="badge"><span className="mr-2 status-dot" /> Local-first analysis</span>
      </header>
      
      <section className="shell grid min-h-[calc(100vh-150px)] items-center gap-16 py-16 lg:grid-cols-[1.08fr_.92fr] lg:py-20">
        <div>
          <div className="eyebrow mb-5">Evidence, not guesswork</div>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.04] tracking-[-.05em] text-slate-50 sm:text-6xl lg:text-7xl">
            Understand any codebase <span className="text-emerald-300">in minutes.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-400">
            Map architecture, surface important files, and investigate errors with deterministic analysis that runs entirely on your machine.
          </p>
          <div className="panel-raised mt-10 p-5 sm:p-6">
            <ImportForm />
            <div className="mt-5 flex gap-3 border-t border-slate-800 pt-4 text-xs leading-5 text-slate-500">
              <span aria-hidden="true" className="mt-0.5 text-emerald-300">◆</span>
              <p className="m-0"><strong className="text-slate-300">Public repositories only.</strong> Imported code is never executed. Common secret files, high-confidence credential patterns, binaries, dependencies, and generated files are excluded before analysis.</p>
            </div>
          </div>
        </div>

        <div className="relative hidden lg:block" aria-hidden="true">
          <div className="absolute -inset-10 rounded-full bg-emerald-400/[.035] blur-3xl" />
          <div className="panel-raised relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-red-400/60" /><span className="h-2.5 w-2.5 rounded-full bg-amber-300/60" /><span className="h-2.5 w-2.5 rounded-full bg-emerald-300/60" /></div>
              <span className="mono text-[11px] text-slate-500">analysis.snapshot</span>
            </div>
            <div className="grid grid-cols-[150px_1fr] min-h-[430px]">
              <div className="border-r border-slate-800 p-4 text-xs text-slate-500">
                <div className="mb-4 text-[10px] font-bold uppercase tracking-widest text-slate-600">Repository</div>
                <div className="space-y-3 mono"><p className="text-emerald-300">▾ src</p><p className="pl-3">▾ app</p><p className="pl-6 text-slate-300">page.tsx</p><p className="pl-6">api/route.ts</p><p>▸ services</p><p>▸ tests</p><p>package.json</p></div>
              </div>
              <div className="p-6">
                <div className="flex items-center justify-between"><span className="eyebrow">Architecture</span><span className="badge badge-accent">High confidence</span></div>
                <div className="mt-8 space-y-4">
                  <div className="mx-auto w-36 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-center text-xs text-slate-300">Frontend</div>
                  <div className="mx-auto h-6 w-px bg-slate-700" />
                  <div className="grid grid-cols-2 gap-4"><div className="rounded-lg border border-emerald-900/80 bg-emerald-950/30 px-3 py-3 text-center text-xs text-emerald-200">API routes</div><div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-center text-xs text-slate-300">Authentication</div></div>
                  <div className="mx-auto h-6 w-px bg-slate-700" />
                  <div className="mx-auto w-36 rounded-lg border border-blue-900/80 bg-blue-950/30 px-4 py-3 text-center text-xs text-blue-200">Database / ORM</div>
                </div>
                <div className="mt-9 grid grid-cols-3 gap-2"><div className="skeleton h-2"/><div className="skeleton h-2"/><div className="skeleton h-2"/></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="shell flex flex-col gap-2 border-t border-slate-800/70 py-6 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between">
        <span>Codex Navigator Lite · deterministic repository intelligence</span>
        <span>No code execution · No external AI · No database</span>
      </footer>
    </main>
  );
}
