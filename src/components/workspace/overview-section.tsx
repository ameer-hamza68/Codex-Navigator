import type { RepositoryWorkspaceResponse } from "../../server/repository-store";
import { DetectionGroup } from "./detection-group";
import { SectionHeading } from "./section-heading";

export function OverviewSection({ workspace }: Readonly<{ workspace: RepositoryWorkspaceResponse }>) {
  const { analysis, repository } = workspace;
  const primaryLanguage = analysis.languages[0]?.name;
  const primaryFramework = analysis.frameworks[0]?.name;
  const summary = primaryFramework !== undefined
    ? `${repository.name} is a ${primaryLanguage ?? "software"} project using ${primaryFramework}, based on manifest and source-file evidence.`
    : `${repository.name} is a ${primaryLanguage ?? "software"} repository analyzed from ${analysis.files.length} safe source and configuration files.`;
  const secondaryDetections = [
    ...analysis.testTools,
    ...analysis.databaseTools,
    ...analysis.authenticationTools,
    ...analysis.deploymentTools,
    ...analysis.ciTools,
  ];
  const runtimeDependencies = analysis.dependencies.filter((dependency) => !dependency.dev);
  const devDependencies = analysis.dependencies.filter((dependency) => dependency.dev);

  return (
    <section aria-labelledby="overview-title">
      <SectionHeading eyebrow="Repository profile" title="Overview">A concise, evidence-backed picture of the project’s stack and operating surface.</SectionHeading>
      <div className="panel p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl"><h3 id="overview-title" className="m-0 text-xl font-semibold tracking-tight">Project summary</h3><p className="mt-3 leading-7 text-slate-400">{summary}</p></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat value={String(analysis.files.length)} label="Indexed files" />
            <Stat value={String(analysis.importantFiles.length)} label="Important" />
            <Stat value={String(secondaryDetections.length)} label="Tool signals" />
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-800 pt-5">
          {analysis.languages.map((item) => <span className="badge badge-accent" key={item.name}>{item.name}</span>)}
          {analysis.frameworks.map((item) => <span className="badge" key={item.name}>{item.name}</span>)}
          {analysis.packageManagers.map((item) => <span className="badge" key={item.name}>{item.name}</span>)}
          {analysis.languages.length + analysis.frameworks.length + analysis.packageManagers.length === 0 && <span className="text-sm text-slate-600">No primary stack detected.</span>}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <DetectionGroup title="Entry points" items={analysis.entryPoints} />
        <DetectionGroup title="Tests" items={analysis.testTools} />
        <DetectionGroup title="Database & ORM" items={analysis.databaseTools} />
        <DetectionGroup title="Authentication" items={analysis.authenticationTools} />
        <DetectionGroup title="Deployment" items={analysis.deploymentTools} />
        <DetectionGroup title="CI" items={analysis.ciTools} />
        <DetectionGroup title="Frameworks" items={analysis.frameworks} />
        <DetectionGroup title="Package managers" items={analysis.packageManagers} />
      </div>

      <div className="panel mt-4 p-5">
        <h3 className="mb-4 text-sm font-semibold">Available package scripts</h3>
        {analysis.scripts.length === 0 ? <p className="m-0 text-sm text-slate-600">No package scripts detected.</p> : (
          <div className="grid gap-2 md:grid-cols-2">
            {analysis.scripts.map((script) => <div key={`${script.sourcePath}-${script.name}`} className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2"><span className="badge badge-accent mono">{script.name}</span><code className="mono truncate text-xs text-slate-400">{script.command}</code></div>)}
          </div>
        )}
      </div>

      <div className="panel mt-4 p-5">
        <h3 className="mb-4 text-sm font-semibold">Dependencies</h3>
        {analysis.dependencies.length === 0 ? <p className="m-0 text-sm text-slate-600">No dependency manifests detected.</p> : (
          <div className="grid gap-4 md:grid-cols-2">
            <DependencyList title="Runtime" items={runtimeDependencies} />
            <DependencyList title="Development" items={devDependencies} />
          </div>
        )}
      </div>
    </section>
  );
}

const MAX_LISTED_DEPENDENCIES = 40;

function DependencyList({ title, items }: Readonly<{ title: string; items: RepositoryWorkspaceResponse["analysis"]["dependencies"] }>) {
  // The same package can be declared by several manifests in a monorepo; show it once.
  const sourcesByName = new Map<string, string[]>();
  for (const item of items) sourcesByName.set(item.name, [...(sourcesByName.get(item.name) ?? []), item.sourcePath]);
  const names = [...sourcesByName.keys()];
  const hidden = names.length - MAX_LISTED_DEPENDENCIES;
  return (
    <div>
      <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-600">{title} · {names.length}</div>
      {names.length === 0 ? <p className="m-0 text-sm text-slate-600">None detected.</p> : (
        <div className="flex flex-wrap gap-2">
          {names.slice(0, MAX_LISTED_DEPENDENCIES).map((name) => <span className="badge mono" key={name} title={sourcesByName.get(name)?.join(", ")}>{name}</span>)}
          {hidden > 0 && <span className="text-xs text-slate-600">+{hidden} more</span>}
        </div>
      )}
    </div>
  );
}

function Stat({ value, label }: Readonly<{ value: string; label: string }>) {
  return <div className="min-w-24 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-3"><div className="mono text-lg font-bold text-slate-200">{value}</div><div className="mt-1 text-[10px] uppercase tracking-wider text-slate-600">{label}</div></div>;
}
