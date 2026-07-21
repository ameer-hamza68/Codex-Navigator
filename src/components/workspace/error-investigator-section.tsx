"use client";

import { useState, type FormEvent } from "react";

import type { ErrorInvestigationResponse } from "../../search/error-investigator";
import { SearchResultList } from "./search-result-list";
import { SectionHeading } from "./section-heading";

export function ErrorInvestigatorSection({ repositoryId }: Readonly<{ repositoryId: string }>) {
  const [errorText, setErrorText] = useState("");
  const [result, setResult] = useState<ErrorInvestigationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  async function investigate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setRequestError(null);
    try {
      const response = await fetch(`/api/repositories/${repositoryId}/errors`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ error: errorText }) });
      const payload = await response.json() as ErrorInvestigationResponse | { error?: { message?: string } };
      if (!response.ok || !("signals" in payload)) throw new Error("error" in payload ? payload.error?.message : "Investigation failed.");
      setResult(payload);
    } catch (reason) { setRequestError(reason instanceof Error ? reason.message : "Investigation failed."); }
    finally { setLoading(false); }
  }

  return (
    <section>
      <SectionHeading eyebrow="Stack-trace triage" title="Error Investigator">Extract concrete signals from an error and compare them with the existing safe repository index.</SectionHeading>
      <form className="panel p-4 sm:p-5" onSubmit={(event) => { void investigate(event); }}>
        <label htmlFor="error-input" className="mb-2 block text-sm font-semibold text-slate-200">Paste an error message or stack trace</label>
        <textarea id="error-input" className="field mono min-h-48 resize-y text-sm leading-6" value={errorText} onChange={(event) => setErrorText(event.target.value)} placeholder={'TypeError: Cannot read properties of undefined\n    at loadSession (src/auth/session.ts:42:11)'} disabled={loading} maxLength={20_000} />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="m-0 text-xs text-slate-600">Repository content is treated as inert text and is never executed.</p><button className="button-primary" disabled={loading || errorText.trim() === ""}>{loading ? "Investigating…" : "Find relevant files"}</button></div>
      </form>
      {requestError !== null && <p className="error-banner mt-4" role="alert">{requestError}</p>}
      {result !== null && (
        <div className="mt-5 space-y-5">
          <div className="rounded-xl border border-amber-800/40 bg-amber-950/15 p-4"><strong className="text-sm text-amber-200">Investigation guidance, not a diagnosis.</strong><p className="mb-0 mt-1 text-sm text-amber-100/70">{result.disclaimer}</p></div>
          <div className="panel p-4"><div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-600">Extracted signals</div><div className="flex flex-wrap gap-2">{(Object.entries(result.signals) as Array<[string, string[]]>).flatMap(([kind, values]) => values.map((value) => <span className="badge mono" key={`${kind}-${value}`}><span className="mr-1 text-slate-600">{kind}:</span>{value}</span>))}{Object.values(result.signals).every((values) => values.length === 0) && <span className="text-sm text-slate-600">No structured signals found; ranking used message text.</span>}</div></div>
          <div className="panel p-4"><div className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-600">General diagnostic guidance</div><ol className="m-0 space-y-2 pl-5 text-sm leading-6 text-slate-400">{result.guidance.map((item) => <li key={item}>{item}</li>)}</ol></div>
          <SearchResultList results={result.search.results} />
        </div>
      )}
      {result === null && !loading && <div className="empty-state mt-5">Paste a stack trace to extract paths, symbols, packages, ports, and error codes.</div>}
    </section>
  );
}
