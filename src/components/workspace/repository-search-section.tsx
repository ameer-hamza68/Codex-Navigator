"use client";

import { useState, type FormEvent } from "react";

import type { RepositorySearchResponse } from "../../domain/repository-analysis";
import { SearchResultList } from "./search-result-list";
import { SectionHeading } from "./section-heading";

const SUGGESTIONS = [
  "Where is authentication implemented?",
  "How are tasks created?",
  "Where is the database schema?",
  "Which files might cause a Redis connection error?",
] as const;

export function RepositorySearchSection({ repositoryId }: Readonly<{ repositoryId: string }>) {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<RepositorySearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(event?: FormEvent<HTMLFormElement>, suggestion?: string) {
    event?.preventDefault();
    const nextQuestion = suggestion ?? question;
    if (nextQuestion.trim() === "") return;
    setQuestion(nextQuestion); setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/repositories/${repositoryId}/search`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: nextQuestion }) });
      const payload = await response.json() as RepositorySearchResponse | { error?: { message?: string } };
      if (!response.ok || !("results" in payload)) throw new Error("error" in payload ? payload.error?.message : "Search failed.");
      setResult(payload);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Search failed."); }
    finally { setLoading(false); }
  }

  return (
    <section>
      <SectionHeading eyebrow="Repository index" title="Ask the codebase">Natural-language search powered by deterministic path, category, symbol, and content ranking.</SectionHeading>
      <form className="panel p-4 sm:p-5" onSubmit={(event) => { void search(event); }}>
        <label className="mb-2 block text-sm font-semibold text-slate-200" htmlFor="repository-question">What do you want to find?</label>
        <div className="flex flex-col gap-2 sm:flex-row"><input id="repository-question" className="field" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="e.g. Where is authentication implemented?" disabled={loading} /><button className="button-primary shrink-0" disabled={loading || question.trim() === ""}>{loading ? "Searching…" : "Search repository"}</button></div>
        <div className="mt-4 flex flex-wrap gap-2"><span className="mr-1 py-2 text-xs text-slate-600">Suggested</span>{SUGGESTIONS.map((suggestion) => <button type="button" className="button-secondary !min-h-8 !rounded-full !text-xs" key={suggestion} onClick={() => { void search(undefined, suggestion); }}>{suggestion}</button>)}</div>
      </form>
      {error !== null && <p className="error-banner mt-4" role="alert">{error}</p>}
      {result !== null && <div className="mt-5"><div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${result.confidence === "low" ? "border-amber-800/40 bg-amber-950/20 text-amber-200" : "border-emerald-900/40 bg-emerald-950/15 text-emerald-200"}`}><strong className="capitalize">{result.confidence} confidence.</strong> {result.message}</div><SearchResultList results={result.results} /></div>}
      {result === null && !loading && <div className="empty-state mt-5"><div className="mb-2 text-xl text-slate-500">⌕</div>Ask a question or choose a suggestion to rank repository files.</div>}
    </section>
  );
}
