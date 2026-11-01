import path from "node:path";

import type {
  DetectionEvidence,
  DetectionResult,
  ImportantFile,
  ImportantFileCategory,
} from "../domain/repository-analysis";
import type { SafeRepositorySourceFile, TechnologyDetection } from "./technology-detector";

export interface ImportantFileDetectionOptions {
  maxResults: number;
  maxPerCategory: number;
  minimumScore: number;
}

interface ScoringRule {
  category: ImportantFileCategory;
  exactFileNames?: readonly string[];
  folderNames?: readonly string[];
  pathPatterns?: readonly RegExp[];
  importPatterns?: readonly RegExp[];
  exportedSymbolPatterns?: readonly RegExp[];
  technologyNames?: readonly string[];
}

interface ScoredEvidence extends DetectionEvidence {
  points: number;
}

const SCORE = {
  exactFileName: 40,
  frameworkConvention: 35,
  folderName: 18,
  import: 16,
  exportedSymbol: 14,
  repositoryRoot: 15,
  technology: 8,
} as const;

export const DEFAULT_IMPORTANT_FILE_OPTIONS: Readonly<ImportantFileDetectionOptions> = {
  maxResults: 24,
  maxPerCategory: 4,
  minimumScore: 18,
};

export const IMPORTANT_FILE_RULES: readonly ScoringRule[] = [
  {
    category: "entry-point",
    exactFileNames: [
      "main.ts", "main.tsx", "main.js", "main.jsx", "index.ts", "index.tsx", "index.js", "index.jsx",
      "server.ts", "server.js", "main.py", "app.py", "manage.py", "wsgi.py", "asgi.py", "app.swift",
      "main.java", "main.kt", "main.go", "main.rs", "index.php", "config.ru", "program.cs",
    ],
    pathPatterns: [
      /(?:^|\/)app\/(?:page|layout)\.[cm]?[jt]sx?$/u,
      /(?:^|\/)pages\/(?:index|_app|_document)\.[cm]?[jt]sx?$/u,
      /(?:^|\/)src\/main\.rs$/u,
    ],
    exportedSymbolPatterns: [/@main\b/u, /\b(?:function|fun)\s+main\b/u, /\bstatic\s+void\s+main\b/u],
  },
  {
    category: "routing",
    exactFileNames: ["routes.ts", "routes.js", "router.ts", "router.js", "urls.py"],
    folderNames: ["routes", "routing", "router", "pages"],
    pathPatterns: [/(?:^|\/)app\/.+\/(?:page|layout)\.[cm]?[jt]sx?$/u],
    importPatterns: [
      /\bfrom\s+["'](?:next\/router|next\/navigation|react-router|vue-router)["']/u,
      /\bfrom\s+(?:django\.urls|flask)\s+import\b/u,
      /^\s*import\s+SwiftUI\b/mu,
    ],
    exportedSymbolPatterns: [/\b(?:router|routes|urlpatterns|NavigationStack|TabView)\b/u],
  },
  {
    category: "authentication",
    exactFileNames: ["auth.ts", "auth.js", "authentication.ts", "authentication.py", "authservice.swift"],
    folderNames: ["auth", "authentication"],
    importPatterns: [
      /["'](?:next-auth|@auth\/core|passport|jsonwebtoken)["']/u,
      /\bdjango\.contrib\.auth\b/u,
      /^\s*import\s+AuthenticationServices\b/mu,
    ],
    exportedSymbolPatterns: [/\b(?:auth|authenticate|authorization|login|logout|session|AuthService)\b/u],
    technologyNames: [
      "Auth.js / NextAuth", "Passport", "jsonwebtoken", "Django authentication", "Spring Security",
      "Laravel Sanctum", "Laravel Passport",
    ],
  },
  {
    category: "database",
    exactFileNames: ["schema.prisma", "models.py", "database.ts", "database.py", "db.ts", "db.py", "persistence.swift"],
    folderNames: ["database", "db", "models", "migrations", "prisma"],
    importPatterns: [
      /["'](?:@prisma\/client|drizzle-orm|sequelize|typeorm)["']/u,
      /\bfrom\s+(?:sqlalchemy|django\.db)\b/u,
      /^\s*import\s+(?:SwiftData|CoreData)\b/mu,
      /\bMicrosoft\.EntityFrameworkCore\b/u,
    ],
    exportedSymbolPatterns: [/\b(?:PrismaClient|ModelContainer|DbContext|Repository|database|schema)\b/u],
    technologyNames: [
      "Prisma", "Drizzle ORM", "Sequelize", "TypeORM", "Django ORM", "SQLAlchemy", "Hibernate",
      "Laravel Eloquent", "Entity Framework Core",
    ],
  },
  {
    category: "api",
    exactFileNames: ["route.ts", "route.js", "api.py", "controller.ts", "controller.js"],
    folderNames: ["api", "controllers", "endpoints"],
    pathPatterns: [/(?:^|\/)app\/api\/.+\/route\.[cm]?[jt]s$/u],
    importPatterns: [/["']express["']/u, /\bfrom\s+(?:fastapi|flask)\s+import\b/u, /@nestjs\/common/u],
    exportedSymbolPatterns: [
      /\bexport\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE)\b/u,
      /@(?:Controller|Get|Post|Put|Patch|Delete)\b/u,
      /\b(?:FastAPI|APIRouter|Blueprint)\s*\(/u,
    ],
  },
  {
    category: "services",
    exactFileNames: ["services.ts", "services.py"],
    folderNames: ["services", "service"],
    pathPatterns: [/(?:^|\/)[^/]+service\.(?:[cm]?[jt]s|py|swift|java|kt|cs|php|rb)$/u],
    exportedSymbolPatterns: [/\b(?:class|struct|function|const)\s+\w*Service\b/u],
  },
  {
    category: "state-management",
    exactFileNames: ["store.ts", "store.js", "state.ts", "state.js", "reducer.ts", "reducer.js"],
    folderNames: ["store", "state", "reducers"],
    importPatterns: [/["'](?:redux|@reduxjs\/toolkit|zustand|pinia|mobx|recoil)["']/u, /^\s*import\s+Combine\b/mu],
    exportedSymbolPatterns: [/\b(?:createStore|configureStore|createSlice|defineStore|ObservableObject)\b/u],
  },
  {
    category: "configuration",
    exactFileNames: [
      "package.json", "tsconfig.json", "jsconfig.json", "next.config.js", "next.config.mjs", "next.config.ts",
      "vite.config.ts", "vite.config.js", "pyproject.toml", "requirements.txt", "package.swift", "pom.xml",
      "build.gradle", "build.gradle.kts", "cargo.toml", "composer.json", "gemfile", "appsettings.json",
    ],
    folderNames: ["config", "configuration"],
    pathPatterns: [/(?:^|\/)[^/]+\.config\.[cm]?[jt]s$/u],
  },
  {
    category: "environment-example",
    exactFileNames: [".env.example"],
  },
  {
    category: "test",
    exactFileNames: ["conftest.py", "pytest.ini", "vitest.config.ts", "jest.config.ts", "playwright.config.ts"],
    folderNames: ["test", "tests", "__tests__", "spec", "specs"],
    pathPatterns: [/(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/u, /(?:^|\/)[^/]+tests?\.swift$/u, /(?:^|\/)test_[^/]+\.py$/u],
    importPatterns: [/["'](?:vitest|jest|@playwright\/test)["']/u, /\bimport\s+pytest\b/u, /^\s*import\s+XCTest\b/mu],
  },
  {
    category: "ci",
    exactFileNames: [".gitlab-ci.yml", "azure-pipelines.yml", "jenkinsfile", "bitbucket-pipelines.yml"],
    folderNames: ["workflows", ".circleci"],
    pathPatterns: [/^\.github\/workflows\/.+\.ya?ml$/u, /^\.circleci\/config\.ya?ml$/u],
    technologyNames: ["GitHub Actions", "GitLab CI", "CircleCI", "Azure Pipelines", "Jenkins", "Bitbucket Pipelines"],
  },
  {
    category: "deployment",
    exactFileNames: [
      "dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml", "vercel.json",
      "netlify.toml", "procfile", "railway.json", "railway.toml", "render.yaml", "render.yml",
    ],
    folderNames: ["k8s", "kubernetes", "terraform", "deployment", "deploy"],
    pathPatterns: [/\.tf$/u],
    technologyNames: ["Docker", "Vercel", "Netlify", "Kubernetes", "Terraform", "Heroku", "Railway", "Render"],
  },
  {
    category: "documentation",
    exactFileNames: ["readme", "readme.md", "readme.rst", "contributing.md", "architecture.md", "changelog.md"],
    folderNames: ["docs", "documentation"],
    pathPatterns: [/(?:^|\/)docs\/.+\.(?:md|mdx|rst)$/u],
  },
];

export function detectImportantFiles(
  files: readonly SafeRepositorySourceFile[],
  technologies: Pick<
    TechnologyDetection,
    "frameworks" | "databaseTools" | "authenticationTools" | "deploymentTools" | "ciTools"
  >,
  options: Readonly<ImportantFileDetectionOptions> = DEFAULT_IMPORTANT_FILE_OPTIONS,
): ImportantFile[] {
  const technologyNames = collectTechnologyNames(technologies);
  const candidates = files.flatMap((file) =>
    IMPORTANT_FILE_RULES.flatMap((rule) => {
      const scoredEvidence = scoreFile(file, rule, technologyNames);
      const score = scoredEvidence.reduce((total, item) => total + item.points, 0);
      if (score < options.minimumScore) return [];

      const evidence = scoredEvidence
        .sort((left, right) => right.points - left.points || left.detail.localeCompare(right.detail))
        .map(({ path: evidencePath, detail }) => ({ path: evidencePath, detail }));
      return [{
        path: normalizePath(file.path),
        category: rule.category,
        score,
        evidence,
        explanation: buildExplanation(rule.category, evidence),
      } satisfies ImportantFile];
    }),
  );

  const categoryCounts = new Map<ImportantFileCategory, number>();
  return candidates
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path) || left.category.localeCompare(right.category))
    .filter((candidate) => {
      const count = categoryCounts.get(candidate.category) ?? 0;
      if (count >= options.maxPerCategory) return false;
      categoryCounts.set(candidate.category, count + 1);
      return true;
    })
    .slice(0, options.maxResults);
}

function scoreFile(
  file: SafeRepositorySourceFile,
  rule: ScoringRule,
  detectedTechnologies: ReadonlySet<string>,
): ScoredEvidence[] {
  const normalizedPath = normalizePath(file.path);
  const lowerPath = normalizedPath.toLowerCase();
  const baseName = path.posix.basename(lowerPath);
  const folders = lowerPath.split("/").slice(0, -1);
  const evidence: ScoredEvidence[] = [];

  if (rule.exactFileNames?.some((name) => name.toLowerCase() === baseName)) {
    evidence.push({ path: normalizedPath, detail: `Exact filename ${path.posix.basename(normalizedPath)}`, points: SCORE.exactFileName });
    // A root README or manifest describes the whole project, so it should outrank nested copies.
    if (folders.length === 0) {
      evidence.push({ path: normalizedPath, detail: "Located at the repository root", points: SCORE.repositoryRoot });
    }
  }
  if (rule.pathPatterns?.some((pattern) => matches(pattern, lowerPath))) {
    evidence.push({ path: normalizedPath, detail: "Matches a common framework or project convention", points: SCORE.frameworkConvention });
  }
  const matchedFolder = rule.folderNames?.find((folder) => folders.includes(folder.toLowerCase()));
  if (matchedFolder !== undefined) {
    evidence.push({ path: normalizedPath, detail: `Located in ${matchedFolder} folder`, points: SCORE.folderName });
  }
  if (rule.importPatterns?.some((pattern) => matches(pattern, file.content))) {
    evidence.push({ path: normalizedPath, detail: "Imports a category-related library or module", points: SCORE.import });
  }
  if (rule.exportedSymbolPatterns?.some((pattern) => matches(pattern, file.content))) {
    evidence.push({ path: normalizedPath, detail: "Defines or exports a category-related symbol", points: SCORE.exportedSymbol });
  }
  const matchedTechnology = rule.technologyNames?.find((name) => detectedTechnologies.has(name));
  if (matchedTechnology !== undefined && evidence.length > 0) {
    evidence.push({ path: normalizedPath, detail: `Consistent with detected technology ${matchedTechnology}`, points: SCORE.technology });
  }

  return evidence;
}

function collectTechnologyNames(
  technologies: Pick<
    TechnologyDetection,
    "frameworks" | "databaseTools" | "authenticationTools" | "deploymentTools" | "ciTools"
  >,
): Set<string> {
  const groups: readonly DetectionResult[][] = [
    technologies.frameworks,
    technologies.databaseTools,
    technologies.authenticationTools,
    technologies.deploymentTools,
    technologies.ciTools,
  ];
  return new Set(groups.flatMap((group) => group.map((item) => item.name)));
}

function buildExplanation(category: ImportantFileCategory, evidence: readonly DetectionEvidence[]): string {
  const label = category.replaceAll("-", " ");
  const primaryEvidence = evidence[0]?.detail.toLowerCase() ?? "repository convention";
  return `Selected as ${label} based on ${primaryEvidence}.`;
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function matches(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}
