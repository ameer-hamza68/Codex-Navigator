"use client";

import { useState } from "react";

import type { ArchitectureDiagram } from "../../domain/repository-analysis";
import { MermaidDiagram } from "./mermaid-diagram";
import { SectionHeading } from "./section-heading";

export function ArchitectureSection({ architecture }: Readonly<{ architecture: ArchitectureDiagram }>) {
  const [copied, setCopied] = useState(false);
  async function copySource() {
    await navigator.clipboard.writeText(architecture.mermaid);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_600);
  }
  return (
    <section>
      <SectionHeading eyebrow="System map" title="Architecture" action={<button className="button-secondary" type="button" onClick={copySource}>{copied ? "Copied" : "Copy Mermaid"}</button>}>
        A conservative static diagram created only from repository evidence. It does not claim runtime call flow.
      </SectionHeading>
      <div className="panel overflow-hidden">
        <div className="border-b border-slate-800 bg-slate-950/35 px-5 py-3 text-xs text-slate-500"><span className="mr-2 status-dot inline-block" />{architecture.fallback ? "Folder-level fallback" : `${architecture.nodes.length} evidence-backed components`}</div>
        <MermaidDiagram source={architecture.mermaid} />
      </div>
      <div className="mt-4 rounded-xl border border-emerald-900/40 bg-emerald-950/15 p-5"><div className="eyebrow mb-2">Plain-language readout</div><p className="m-0 leading-7 text-slate-300">{architecture.explanation}</p></div>
    </section>
  );
}
