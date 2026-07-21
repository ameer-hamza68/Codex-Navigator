"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import type { RepositoryWorkspaceResponse } from "../server/repository-store";

const EXAMPLES = [
  { label: "Hello World", url: "https://github.com/octocat/Hello-World" },
  { label: "Ky", url: "https://github.com/sindresorhus/ky" },
  { label: "Click", url: "https://github.com/pallets/click" },
] as const;

export function ImportForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [loadingKind, setLoadingKind] = useState<"github" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoadingKind("github");
    try {
      const response = await fetch("/api/repositories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload: unknown = await response.json();
      if (!response.ok || !isWorkspaceResponse(payload)) {
        throw new Error(readError(payload));
      }
      router.push(`/repositories/${payload.repository.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The repository could not be analyzed.");
      setLoadingKind(null);
    }
  }

  async function loadDemoRepository() {
    setError(null);
    setLoadingKind("demo");
    try {
      const response = await fetch("/api/repositories/demo", { method: "POST" });
      const payload: unknown = await response.json();
      if (!response.ok || !isWorkspaceResponse(payload)) {
        throw new Error(readError(payload));
      }
      router.push(`/repositories/${payload.repository.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The demo repository could not be analyzed.");
      setLoadingKind(null);
    }
  }

  return (
    <div>
      <form onSubmit={submit} aria-label="Analyze a public GitHub repository">
        <label htmlFor="repository-url" className="mb-2 block text-sm font-semibold text-slate-200">Public GitHub repository URL</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <span aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">⌘</span>
            <input
              id="repository-url"
              className="field pl-11"
              type="url"
              required
              autoComplete="url"
              spellCheck={false}
              placeholder="https://github.com/owner/repository"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              disabled={loadingKind !== null}
            />
          </div>
          <button className="button-primary sm:min-w-32" type="submit" disabled={loadingKind !== null}>
            {loadingKind === "github" ? <><span className="status-dot" /> Analyzing…</> : <>Analyze <span aria-hidden="true">→</span></>}
          </button>
        </div>
        {error !== null && <p className="error-banner mt-3" role="alert">{error}</p>}
        {loadingKind === "github" && <p className="mt-3 text-sm text-slate-400" role="status">Cloning a shallow snapshot, filtering unsafe files, and building the local index. This can take up to a minute.</p>}
        {loadingKind === "demo" && <p className="mt-3 text-sm text-slate-400" role="status">Analyzing the bundled TaskFlow fixture locally. This should only take a moment.</p>}
      </form>

      <div className="mt-5 flex flex-col gap-3 rounded-xl border border-emerald-900/50 bg-emerald-950/15 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-emerald-200">Demo Repository</div>
          <p className="mb-0 mt-1 text-xs leading-5 text-slate-500">A bundled Next.js task-management codebase with authentication, Prisma, Redis, tests, and Docker.</p>
        </div>
        <button className="button-secondary shrink-0" type="button" onClick={() => { void loadDemoRepository(); }} disabled={loadingKind !== null}>
          {loadingKind === "demo" ? "Loading demo…" : "Try Demo Repository"}
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2" aria-label="Example repositories">
        <span className="mr-1 text-xs font-medium uppercase tracking-wider text-slate-500">Public examples</span>
        {EXAMPLES.map((example) => (
          <button key={example.url} type="button" className="button-secondary !min-h-8 !rounded-full !px-3 !text-xs" onClick={() => setUrl(example.url)} disabled={loadingKind !== null}>
            {example.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function isWorkspaceResponse(value: unknown): value is RepositoryWorkspaceResponse {
  return typeof value === "object" && value !== null && "repository" in value && "analysis" in value;
}

function readError(value: unknown): string {
  if (typeof value === "object" && value !== null && "error" in value && typeof value.error === "object" && value.error !== null && "message" in value.error && typeof value.error.message === "string") {
    return value.error.message;
  }
  return "The repository could not be analyzed.";
}
