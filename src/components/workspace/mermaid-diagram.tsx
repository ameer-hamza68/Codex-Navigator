"use client";

import { useEffect, useId, useState } from "react";

export function MermaidDiagram({ source }: Readonly<{ source: string }>) {
  const id = useId().replaceAll(":", "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    void import("mermaid").then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "dark", fontFamily: "Inter, sans-serif" });
      try {
        const result = await mermaid.render(`architecture-${id}`, source);
        if (active) setSvg(result.svg);
      } catch {
        if (active) setError(true);
      }
    });
    return () => { active = false; };
  }, [id, source]);

  if (error) return <pre className="code-block m-0 p-4">{source}</pre>;
  if (svg === null) return <div className="grid min-h-80 place-items-center" role="status"><div className="text-center"><div className="status-dot mx-auto mb-3" /><span className="text-sm text-slate-500">Rendering architecture…</span></div></div>;
  return <div className="mermaid-output overflow-auto p-4" aria-label="Repository architecture diagram" dangerouslySetInnerHTML={{ __html: svg }} />;
}
