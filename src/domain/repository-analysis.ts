export type DetectionConfidence = "high" | "medium" | "low";

export interface DetectionEvidence {
  path: string;
  detail: string;
}

export interface DetectionResult {
  name: string;
  confidence: DetectionConfidence;
  evidence: DetectionEvidence[];
}

export interface RepositoryFile {
  path: string;
  sizeBytes: number;
  extension: string | null;
  language: string | null;
  lineCount: number | null;
}

export type ImportantFileCategory =
  | "documentation"
  | "entry-point"
  | "configuration"
  | "authentication"
  | "routing"
  | "database"
  | "api"
  | "services"
  | "state-management"
  | "environment-example"
  | "test"
  | "deployment"
  | "ci";

export interface ImportantFile {
  path: string;
  category: ImportantFileCategory;
  score: number;
  evidence: DetectionEvidence[];
  explanation: string;
}

export interface RepositoryTreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: RepositoryTreeNode[];
  omittedCount?: number;
}

export interface SearchExcerpt {
  startLine: number;
  endLine: number;
  text: string;
  matchedTerms: string[];
}

export interface SearchResult {
  path: string;
  displayPath: string;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  excerpts: SearchExcerpt[];
}

export interface RepositorySearchResponse {
  normalizedQuestion: string;
  confidence: "high" | "medium" | "low";
  message: string;
  results: SearchResult[];
}

export interface ArchitectureNode {
  id: string;
  kind:
    | "client"
    | "frontend"
    | "routes"
    | "api"
    | "services"
    | "authentication"
    | "database"
    | "external-services"
    | "tests"
    | "delivery"
    | "repository"
    | "folder";
  label: string;
  evidence: DetectionEvidence[];
}

export interface ArchitectureEdge {
  from: string;
  to: string;
  label?: string;
  style: "flow" | "support";
}

export interface ArchitectureDiagram {
  mermaid: string;
  explanation: string;
  nodes: ArchitectureNode[];
  edges: ArchitectureEdge[];
  fallback: boolean;
}

export interface PackageScript {
  name: string;
  command: string;
  sourcePath: string;
}

export interface ProjectDependency {
  name: string;
  sourcePath: string;
  /** True for development-only dependencies such as devDependencies or test groups. */
  dev: boolean;
}

export interface RepositoryAnalysis {
  files: RepositoryFile[];
  tree: RepositoryTreeNode[];
  importantFiles: ImportantFile[];
  languages: DetectionResult[];
  frameworks: DetectionResult[];
  packageManagers: DetectionResult[];
  testTools: DetectionResult[];
  databaseTools: DetectionResult[];
  authenticationTools: DetectionResult[];
  deploymentTools: DetectionResult[];
  ciTools: DetectionResult[];
  scripts: PackageScript[];
  dependencies: ProjectDependency[];
  entryPoints: DetectionResult[];
  architecture: ArchitectureDiagram;
  warnings: string[];
}
