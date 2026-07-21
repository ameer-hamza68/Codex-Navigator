"use client";

import { useEffect, useState } from "react";

interface FileResponse { path: string; lines: Array<{ number: number; text: string }>; truncated: boolean }

export function FileExcerpt({ repositoryId, path }: Readonly<{ repositoryId: string; path: string }>) {
  const [data, setData] = useState<FileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/repositories/${repositoryId}/files?path=${encodeURIComponent(path)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The safe excerpt is unavailable.");
        return await response.json() as FileResponse;
      })
      .then(setData)
      .catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Excerpt unavailable."); });
    return () => controller.abort();
  }, [path, repositoryId]);
  if (error !== null) return <p className="error-banner m-3">{error}</p>;
  if (data === null) return <div className="p-4"><div className="skeleton h-24" /></div>;
  return (
    <div className="code-block m-3 max-h-96">
      {data.lines.map((line) => <div key={line.number} className="grid grid-cols-[44px_1fr] border-b border-slate-900 last:border-0"><span className="select-none border-r border-slate-800 px-2 py-0.5 text-right text-slate-700">{line.number}</span><code className="whitespace-pre-wrap break-words px-3 py-0.5">{line.text || " "}</code></div>)}
      {data.truncated && <div className="px-4 py-3 text-slate-600">Excerpt limited to the first 120 lines.</div>}
    </div>
  );
}
