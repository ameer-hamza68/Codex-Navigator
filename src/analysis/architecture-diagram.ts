import type {
  ArchitectureDiagram,
  ArchitectureEdge,
  ArchitectureNode,
  DetectionEvidence,
  ImportantFile,
} from "../domain/repository-analysis";
import type { SafeRepositorySourceFile, TechnologyDetection } from "./technology-detector";

export interface ArchitectureDiagramOptions {
  maxNodes: number;
  maxFallbackFolders: number;
}

interface ComponentRule {
  kind: ArchitectureNode["kind"];
  label: string;
  technologyNames?: readonly string[];
  importantCategories?: readonly ImportantFile["category"][];
  filePatterns?: readonly RegExp[];
  contentPatterns?: readonly RegExp[];
}

export const DEFAULT_ARCHITECTURE_OPTIONS: Readonly<ArchitectureDiagramOptions> = {
  maxNodes: 10,
  maxFallbackFolders: 6,
};

const FRONTEND_TECHNOLOGIES = ["Next.js", "React", "Vue", "Angular", "SwiftUI"] as const;

export const ARCHITECTURE_COMPONENT_RULES: readonly ComponentRule[] = [
  {
    kind: "frontend",
    label: "Frontend",
    technologyNames: FRONTEND_TECHNOLOGIES,
    filePatterns: [/(?:^|\/)(?:app|pages|views|components)\/.+\.(?:[cm]?[jt]sx?|swift)$/u],
  },
  {
    kind: "routes",
    label: "Pages and Routes",
    importantCategories: ["routing"],
    filePatterns: [
      /(?:^|\/)app\/(?:page|layout)\.[cm]?[jt]sx?$/u,
      /(?:^|\/)pages\/(?:index|_app|_document)\.[cm]?[jt]sx?$/u,
    ],
  },
  {
    kind: "api",
    label: "API Routes and Controllers",
    technologyNames: ["Express", "NestJS", "Django", "Flask", "FastAPI", "Spring", "Laravel"],
    importantCategories: ["api"],
  },
  {
    kind: "services",
    label: "Services",
    importantCategories: ["services"],
  },
  {
    kind: "authentication",
    label: "Authentication",
    importantCategories: ["authentication"],
  },
  {
    kind: "database",
    label: "Database or ORM",
    importantCategories: ["database"],
  },
  {
    kind: "external-services",
    label: "External Services",
    contentPatterns: [
      /(?:from\s+|require\s*\(\s*|import\s+.*?from\s+)["'](?:stripe|twilio|@aws-sdk\/|firebase|@supabase\/|resend|sendgrid)/iu,
      /\b(?:Stripe|Twilio|S3Client|SupabaseClient|SendGrid)\b/u,
    ],
  },
  {
    kind: "tests",
    label: "Tests",
    importantCategories: ["test"],
  },
  {
    kind: "delivery",
    label: "CI and Deployment",
    importantCategories: ["ci", "deployment"],
  },
];

export function generateArchitectureDiagram(
  files: readonly SafeRepositorySourceFile[],
  technologies: Pick<
    TechnologyDetection,
    | "frameworks"
    | "testTools"
    | "databaseTools"
    | "authenticationTools"
    | "deploymentTools"
    | "ciTools"
  >,
  importantFiles: readonly ImportantFile[],
  options: Readonly<ArchitectureDiagramOptions> = DEFAULT_ARCHITECTURE_OPTIONS,
): ArchitectureDiagram {
  const technologyEvidence = collectTechnologyEvidence(technologies);
  const componentNodes = ARCHITECTURE_COMPONENT_RULES.flatMap((rule) => {
    const evidence = collectComponentEvidence(rule, files, importantFiles, technologyEvidence);
    return evidence.length === 0 ? [] : [createNode(rule.kind, rule.label, evidence)];
  });

  if (componentNodes.length === 0) {
    return createFolderFallback(files, options);
  }

  const nodes: ArchitectureNode[] = [];
  const frontend = componentNodes.find((node) => node.kind === "frontend");
  if (frontend !== undefined) {
    nodes.push(createNode("client", "User or Client", frontend.evidence));
  }
  nodes.push(...componentNodes);
  const boundedNodes = nodes.slice(0, Math.max(1, options.maxNodes)).map((node, index) => ({ ...node, id: `n${index}` }));
  const edges = buildArchitectureEdges(boundedNodes);

  return {
    mermaid: renderMermaid(boundedNodes, edges),
    explanation: explainArchitecture(boundedNodes, edges),
    nodes: boundedNodes,
    edges,
    fallback: false,
  };
}

export function sanitizeMermaidLabel(label: string): string {
  const withoutControlCharacters = [...label].filter((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint >= 32 && codePoint !== 127;
  }).join("");
  const sanitized = withoutControlCharacters
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9 ._/-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 60);
  return sanitized === "" ? "Unnamed" : sanitized;
}

function collectComponentEvidence(
  rule: ComponentRule,
  files: readonly SafeRepositorySourceFile[],
  importantFiles: readonly ImportantFile[],
  technologyEvidence: ReadonlyMap<string, readonly DetectionEvidence[]>,
): DetectionEvidence[] {
  const evidence: DetectionEvidence[] = [];
  for (const technologyName of rule.technologyNames ?? []) {
    evidence.push(...(technologyEvidence.get(technologyName) ?? []));
  }
  for (const importantFile of importantFiles) {
    if (rule.importantCategories?.includes(importantFile.category) === true) {
      evidence.push({ path: importantFile.path, detail: `Classified as ${importantFile.category}` });
    }
  }
  for (const file of files) {
    const normalizedPath = file.path.replaceAll("\\", "/").toLowerCase();
    if (rule.filePatterns?.some((pattern) => testPattern(pattern, normalizedPath)) === true) {
      evidence.push({ path: file.path.replaceAll("\\", "/"), detail: "Matched project structure" });
    }
    if (rule.contentPatterns?.some((pattern) => testPattern(pattern, file.content)) === true) {
      evidence.push({ path: file.path.replaceAll("\\", "/"), detail: "Matched safe source integration pattern" });
    }
  }
  return deduplicateEvidence(evidence).slice(0, 5);
}

function collectTechnologyEvidence(
  technologies: Pick<
    TechnologyDetection,
    | "frameworks"
    | "testTools"
    | "databaseTools"
    | "authenticationTools"
    | "deploymentTools"
    | "ciTools"
  >,
): Map<string, DetectionEvidence[]> {
  const result = new Map<string, DetectionEvidence[]>();
  const groups = [
    technologies.frameworks,
    technologies.testTools,
    technologies.databaseTools,
    technologies.authenticationTools,
    technologies.deploymentTools,
    technologies.ciTools,
  ];
  for (const detection of groups.flat()) {
    result.set(detection.name, detection.evidence);
  }
  return result;
}

function createNode(
  kind: ArchitectureNode["kind"],
  label: string,
  evidence: readonly DetectionEvidence[],
): ArchitectureNode {
  return { id: "", kind, label: sanitizeMermaidLabel(label), evidence: [...evidence] };
}

function buildArchitectureEdges(nodes: readonly ArchitectureNode[]): ArchitectureEdge[] {
  const byKind = new Map(nodes.map((node) => [node.kind, node]));
  const edges: ArchitectureEdge[] = [];
  const connect = (
    from: ArchitectureNode["kind"],
    to: ArchitectureNode["kind"],
    label: string,
    style: ArchitectureEdge["style"] = "flow",
  ) => {
    const source = byKind.get(from);
    const target = byKind.get(to);
    if (source !== undefined && target !== undefined) edges.push({ from: source.id, to: target.id, label, style });
  };

  connect("client", "frontend", "uses");
  connect("frontend", "routes", "navigates");
  if (byKind.has("routes")) connect("routes", "api", "requests");
  else connect("frontend", "api", "requests");
  if (byKind.has("services")) {
    connect("api", "services", "calls");
    connect("routes", "services", "uses");
    connect("services", "authentication", "checks");
    connect("services", "database", "reads/writes");
    connect("services", "external-services", "integrates");
  } else {
    connect("api", "authentication", "checks");
    connect("api", "database", "reads/writes");
    connect("api", "external-services", "integrates");
  }

  const applicationTarget = byKind.get("api") ?? byKind.get("frontend") ?? byKind.get("routes");
  const tests = byKind.get("tests");
  if (tests !== undefined && applicationTarget !== undefined) {
    edges.push({ from: tests.id, to: applicationTarget.id, label: "verifies", style: "support" });
  }
  const delivery = byKind.get("delivery");
  if (delivery !== undefined && applicationTarget !== undefined) {
    edges.push({ from: delivery.id, to: applicationTarget.id, label: "builds/deploys", style: "support" });
  }
  return edges;
}

function createFolderFallback(
  files: readonly SafeRepositorySourceFile[],
  options: Readonly<ArchitectureDiagramOptions>,
): ArchitectureDiagram {
  const folderEvidence = new Map<string, DetectionEvidence[]>();
  for (const file of files) {
    const normalizedPath = file.path.replaceAll("\\", "/");
    const segments = normalizedPath.split("/");
    const folder = segments.length > 1 ? segments[0] ?? "" : "Root files";
    const existing = folderEvidence.get(folder) ?? [];
    if (existing.length < 3) existing.push({ path: normalizedPath, detail: "Located in this folder" });
    folderEvidence.set(folder, existing);
  }

  const repositoryNode = createNode("repository", "Repository", []);
  const folderNodes = [...folderEvidence.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, Math.min(options.maxFallbackFolders, Math.max(0, options.maxNodes - 1)))
    .map(([folder, evidence]) => createNode("folder", folder, evidence));
  const nodes = [repositoryNode, ...folderNodes].map((node, index) => ({ ...node, id: `n${index}` }));
  const edges = folderNodes.map((_, index): ArchitectureEdge => ({
    from: "n0",
    to: `n${index + 1}`,
    label: "contains",
    style: "flow",
  }));
  return {
    mermaid: renderMermaid(nodes, edges),
    explanation: folderNodes.length === 0
      ? "No supported architecture signals or repository folders were detected."
      : `Architecture was unclear, so the diagram shows ${folderNodes.length} observed top-level ${folderNodes.length === 1 ? "folder" : "folders"}.`,
    nodes,
    edges,
    fallback: true,
  };
}

function renderMermaid(nodes: readonly ArchitectureNode[], edges: readonly ArchitectureEdge[]): string {
  const lines = ["flowchart LR"];
  nodes.forEach((node) => lines.push(`  ${node.id}["${sanitizeMermaidLabel(node.label)}"]`));
  edges.forEach((edge) => {
    const arrow = edge.style === "support" ? "-.->" : "-->";
    const label = edge.label === undefined ? "" : `|${sanitizeMermaidLabel(edge.label)}|`;
    lines.push(`  ${edge.from} ${arrow}${label} ${edge.to}`);
  });
  return lines.join("\n");
}

function explainArchitecture(nodes: readonly ArchitectureNode[], edges: readonly ArchitectureEdge[]): string {
  const componentNames = nodes.filter((node) => node.kind !== "client").map((node) => node.label);
  const flowDescriptions = edges
    .filter((edge) => edge.style === "flow")
    .slice(0, 4)
    .map((edge) => {
      const from = nodes.find((node) => node.id === edge.from)?.label ?? edge.from;
      const to = nodes.find((node) => node.id === edge.to)?.label ?? edge.to;
      return `${from} ${edge.label ?? "connects to"} ${to}`;
    });
  const componentSentence = `Detected components: ${componentNames.join(", ")}.`;
  return flowDescriptions.length === 0 ? componentSentence : `${componentSentence} Observed flow: ${flowDescriptions.join("; ")}.`;
}

function deduplicateEvidence(evidence: readonly DetectionEvidence[]): DetectionEvidence[] {
  const seen = new Set<string>();
  return evidence.filter((item) => {
    const key = `${item.path}\0${item.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function testPattern(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}
