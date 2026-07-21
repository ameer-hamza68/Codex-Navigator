import path from "node:path";

import type {
  DetectionConfidence,
  DetectionEvidence,
  DetectionResult,
  PackageScript,
} from "../domain/repository-analysis";

export interface SafeRepositorySourceFile {
  /** A normalized, repository-relative path that has passed the file filter. */
  path: string;
  content: string;
}

export interface TechnologyDetection {
  languages: DetectionResult[];
  frameworks: DetectionResult[];
  packageManagers: DetectionResult[];
  testTools: DetectionResult[];
  databaseTools: DetectionResult[];
  authenticationTools: DetectionResult[];
  deploymentTools: DetectionResult[];
  ciTools: DetectionResult[];
  scripts: PackageScript[];
  entryPoints: DetectionResult[];
}

interface LanguageRule {
  name: string;
  extensions: readonly string[];
}

interface MatchRule {
  name: string;
  confidence?: DetectionConfidence;
  dependencies?: readonly string[];
  fileNames?: readonly string[];
  pathPatterns?: readonly RegExp[];
  contentPatterns?: readonly RegExp[];
}

interface DependencyEvidence {
  name: string;
  path: string;
}

const MAX_EVIDENCE_PER_FACT = 5;

export const LANGUAGE_RULES: readonly LanguageRule[] = [
  { name: "TypeScript", extensions: [".ts", ".tsx", ".mts", ".cts"] },
  { name: "JavaScript", extensions: [".js", ".jsx", ".mjs", ".cjs"] },
  { name: "Python", extensions: [".py"] },
  { name: "Swift", extensions: [".swift"] },
  { name: "Java", extensions: [".java"] },
  { name: "Kotlin", extensions: [".kt", ".kts"] },
  { name: "Go", extensions: [".go"] },
  { name: "Rust", extensions: [".rs"] },
  { name: "PHP", extensions: [".php"] },
  { name: "Ruby", extensions: [".rb"] },
  { name: "C#", extensions: [".cs"] },
];

export const FRAMEWORK_RULES: readonly MatchRule[] = [
  { name: "Next.js", dependencies: ["next"], fileNames: ["next.config.js", "next.config.mjs", "next.config.ts"] },
  { name: "React", dependencies: ["react", "react-dom"] },
  { name: "Vue", dependencies: ["vue"], contentPatterns: [/\bfrom\s+["']vue["']/u] },
  { name: "Angular", dependencies: ["@angular/core"], fileNames: ["angular.json"] },
  { name: "Express", dependencies: ["express"] },
  { name: "NestJS", dependencies: ["@nestjs/core"], fileNames: ["nest-cli.json"] },
  { name: "Django", dependencies: ["django"], contentPatterns: [/\bfrom\s+django\b/u, /\bimport\s+django\b/u] },
  { name: "Flask", dependencies: ["flask"], contentPatterns: [/\bfrom\s+flask\s+import\b/u] },
  { name: "FastAPI", dependencies: ["fastapi"], contentPatterns: [/\bfrom\s+fastapi\s+import\b/u] },
  { name: "SwiftUI", contentPatterns: [/^\s*import\s+SwiftUI\b/mu] },
  {
    name: "Spring",
    dependencies: ["spring-boot-starter", "spring-boot-starter-web", "org.springframework.boot"],
    contentPatterns: [/\bimport\s+org\.springframework\b/u],
  },
  { name: "Laravel", dependencies: ["laravel/framework"], fileNames: ["artisan"] },
];

export const PACKAGE_MANAGER_RULES: readonly MatchRule[] = [
  { name: "npm", fileNames: ["package-lock.json"] },
  { name: "pnpm", fileNames: ["pnpm-lock.yaml", "pnpm-workspace.yaml"] },
  { name: "Yarn", fileNames: ["yarn.lock"] },
  { name: "Bun", fileNames: ["bun.lock", "bun.lockb"] },
  { name: "pip", fileNames: ["requirements.txt", "requirements-dev.txt", "pipfile", "pipfile.lock"] },
  { name: "Poetry", fileNames: ["poetry.lock"], contentPatterns: [/^\s*\[tool\.poetry\]/mu] },
  { name: "Swift Package Manager", fileNames: ["package.swift", "package.resolved"] },
  { name: "Gradle", fileNames: ["build.gradle", "build.gradle.kts", "gradlew", "gradlew.bat", "settings.gradle", "settings.gradle.kts"] },
  { name: "Maven", fileNames: ["pom.xml", "mvnw", "mvnw.cmd"] },
  { name: "Cargo", fileNames: ["cargo.toml", "cargo.lock"] },
];

export const TEST_TOOL_RULES: readonly MatchRule[] = [
  { name: "Vitest", dependencies: ["vitest"], fileNames: ["vitest.config.ts", "vitest.config.js", "vitest.config.mts"] },
  { name: "Jest", dependencies: ["jest", "@jest/core"], fileNames: ["jest.config.js", "jest.config.ts"] },
  { name: "Playwright", dependencies: ["@playwright/test"], fileNames: ["playwright.config.ts", "playwright.config.js"] },
  { name: "pytest", dependencies: ["pytest"], fileNames: ["pytest.ini", "conftest.py"] },
  { name: "RSpec", dependencies: ["rspec"], fileNames: [".rspec"] },
  { name: "PHPUnit", dependencies: ["phpunit/phpunit"], fileNames: ["phpunit.xml", "phpunit.xml.dist"] },
  { name: "JUnit", dependencies: ["junit", "junit-jupiter", "junit-jupiter-api"], contentPatterns: [/\bimport\s+org\.junit\b/u] },
  { name: "XCTest", contentPatterns: [/^\s*import\s+XCTest\b/mu] },
  { name: "xUnit.net", dependencies: ["xunit"], contentPatterns: [/\busing\s+Xunit\s*;/u] },
];

export const DATABASE_TOOL_RULES: readonly MatchRule[] = [
  { name: "Prisma", dependencies: ["prisma", "@prisma/client"], fileNames: ["schema.prisma"] },
  { name: "Drizzle ORM", dependencies: ["drizzle-orm"], fileNames: ["drizzle.config.ts"] },
  { name: "Sequelize", dependencies: ["sequelize"] },
  { name: "TypeORM", dependencies: ["typeorm"] },
  { name: "Django ORM", dependencies: ["django"], pathPatterns: [/(?:^|\/)models\.py$/u] },
  { name: "SQLAlchemy", dependencies: ["sqlalchemy"], contentPatterns: [/\bfrom\s+sqlalchemy\b/u] },
  { name: "Hibernate", dependencies: ["hibernate-core", "spring-boot-starter-data-jpa"], contentPatterns: [/\borg\.hibernate\b/u] },
  { name: "Laravel Eloquent", dependencies: ["laravel/framework"], contentPatterns: [/Illuminate\\Database\\Eloquent/u] },
  { name: "Entity Framework Core", dependencies: ["microsoft.entityframeworkcore"], contentPatterns: [/\bMicrosoft\.EntityFrameworkCore\b/u] },
];

export const AUTHENTICATION_RULES: readonly MatchRule[] = [
  { name: "Auth.js / NextAuth", dependencies: ["next-auth", "@auth/core"] },
  { name: "Passport", dependencies: ["passport"] },
  { name: "jsonwebtoken", dependencies: ["jsonwebtoken"] },
  { name: "Django authentication", dependencies: ["django"], contentPatterns: [/django\.contrib\.auth/u] },
  { name: "Spring Security", dependencies: ["spring-security", "spring-boot-starter-security"], contentPatterns: [/org\.springframework\.security/u] },
  { name: "Laravel Sanctum", dependencies: ["laravel/sanctum"] },
  { name: "Laravel Passport", dependencies: ["laravel/passport"] },
];

export const DEPLOYMENT_RULES: readonly MatchRule[] = [
  { name: "Docker", fileNames: ["dockerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"] },
  { name: "Vercel", fileNames: ["vercel.json"] },
  { name: "Netlify", fileNames: ["netlify.toml"] },
  { name: "Kubernetes", pathPatterns: [/(?:^|\/)k8s\/.+\.ya?ml$/u, /(?:^|\/)kubernetes\/.+\.ya?ml$/u] },
  { name: "Terraform", pathPatterns: [/\.tf$/u] },
  { name: "Heroku", fileNames: ["procfile"] },
  { name: "Railway", fileNames: ["railway.json", "railway.toml"] },
  { name: "Render", fileNames: ["render.yaml", "render.yml"] },
];

export const CI_RULES: readonly MatchRule[] = [
  { name: "GitHub Actions", pathPatterns: [/^\.github\/workflows\/.+\.ya?ml$/u] },
  { name: "GitLab CI", fileNames: [".gitlab-ci.yml", ".gitlab-ci.yaml"] },
  { name: "CircleCI", pathPatterns: [/^\.circleci\/config\.ya?ml$/u] },
  { name: "Azure Pipelines", fileNames: ["azure-pipelines.yml", "azure-pipelines.yaml"] },
  { name: "Jenkins", fileNames: ["jenkinsfile"] },
  { name: "Bitbucket Pipelines", fileNames: ["bitbucket-pipelines.yml", "bitbucket-pipelines.yaml"] },
];

export const ENTRY_POINT_RULES: readonly MatchRule[] = [
  { name: "Next.js App Router entry", pathPatterns: [/(?:^|\/)app\/(?:page|layout)\.(?:[cm]?[jt]sx?)$/u] },
  { name: "Next.js Pages Router entry", pathPatterns: [/(?:^|\/)pages\/(?:index|_app|_document)\.(?:[cm]?[jt]sx?)$/u] },
  { name: "JavaScript/TypeScript entry", pathPatterns: [/(?:^|\/)(?:src\/)?(?:index|main|server|app)\.(?:[cm]?[jt]sx?)$/u] },
  { name: "Python entry", fileNames: ["manage.py", "wsgi.py", "asgi.py", "__main__.py"], pathPatterns: [/(?:^|\/)(?:main|app)\.py$/u] },
  { name: "Swift application entry", contentPatterns: [/@main\b[\s\S]{0,500}\bstruct\b/u] },
  { name: "Java/Kotlin application entry", contentPatterns: [/\bstatic\s+void\s+main\s*\(/u, /\bfun\s+main\s*\(/u, /@SpringBootApplication\b/u] },
  { name: "Go entry", pathPatterns: [/(?:^|\/)main\.go$/u], contentPatterns: [/\bpackage\s+main\b/u] },
  { name: "Rust entry", pathPatterns: [/(?:^|\/)src\/main\.rs$/u] },
  { name: "PHP entry", pathPatterns: [/(?:^|\/)(?:public\/)?index\.php$/u], fileNames: ["artisan"] },
  { name: "Ruby entry", pathPatterns: [/(?:^|\/)(?:config\.ru|bin\/rails)$/u] },
  { name: "C# entry", pathPatterns: [/(?:^|\/)program\.cs$/u] },
];

export function detectRepositoryTechnologies(
  files: readonly SafeRepositorySourceFile[],
): TechnologyDetection {
  const normalizedFiles = files.map((file) => ({
    path: file.path.replaceAll("\\", "/"),
    content: file.content,
  }));
  const dependencies = collectDependencies(normalizedFiles);

  return {
    languages: detectLanguages(normalizedFiles),
    frameworks: applyRules(FRAMEWORK_RULES, normalizedFiles, dependencies),
    packageManagers: applyRules(PACKAGE_MANAGER_RULES, normalizedFiles, dependencies),
    testTools: applyRules(TEST_TOOL_RULES, normalizedFiles, dependencies),
    databaseTools: applyRules(DATABASE_TOOL_RULES, normalizedFiles, dependencies),
    authenticationTools: applyRules(AUTHENTICATION_RULES, normalizedFiles, dependencies),
    deploymentTools: applyRules(DEPLOYMENT_RULES, normalizedFiles, dependencies),
    ciTools: applyRules(CI_RULES, normalizedFiles, dependencies),
    scripts: detectPackageScripts(normalizedFiles),
    entryPoints: applyRules(ENTRY_POINT_RULES, normalizedFiles, dependencies),
  };
}

function detectLanguages(files: readonly SafeRepositorySourceFile[]): DetectionResult[] {
  return LANGUAGE_RULES.flatMap((rule) => {
    const evidence = files
      .filter((file) => rule.extensions.includes(path.posix.extname(file.path.toLowerCase())))
      .slice(0, MAX_EVIDENCE_PER_FACT)
      .map((file) => ({ path: file.path, detail: `File extension ${path.posix.extname(file.path)}` }));

    return evidence.length === 0 ? [] : [{ name: rule.name, confidence: "high" as const, evidence }];
  });
}

function applyRules(
  rules: readonly MatchRule[],
  files: readonly SafeRepositorySourceFile[],
  dependencies: readonly DependencyEvidence[],
): DetectionResult[] {
  return rules.flatMap((rule) => {
    const evidence = collectRuleEvidence(rule, files, dependencies).slice(0, MAX_EVIDENCE_PER_FACT);
    return evidence.length === 0
      ? []
      : [{ name: rule.name, confidence: rule.confidence ?? "high", evidence }];
  });
}

function collectRuleEvidence(
  rule: MatchRule,
  files: readonly SafeRepositorySourceFile[],
  dependencies: readonly DependencyEvidence[],
): DetectionEvidence[] {
  const evidence: DetectionEvidence[] = [];
  const dependencyNames = new Set(rule.dependencies?.map((name) => name.toLowerCase()) ?? []);

  for (const dependency of dependencies) {
    if (dependencyNames.has(dependency.name.toLowerCase())) {
      evidence.push({ path: dependency.path, detail: `Dependency ${dependency.name}` });
    }
  }

  for (const file of files) {
    const lowerPath = file.path.toLowerCase();
    const baseName = path.posix.basename(lowerPath);
    if (rule.fileNames?.some((name) => name.toLowerCase() === baseName)) {
      evidence.push({ path: file.path, detail: `Matched filename ${path.posix.basename(file.path)}` });
    }
    if (rule.pathPatterns?.some((pattern) => testPattern(pattern, lowerPath))) {
      evidence.push({ path: file.path, detail: "Matched repository path" });
    }
    if (rule.contentPatterns?.some((pattern) => testPattern(pattern, file.content))) {
      evidence.push({ path: file.path, detail: "Matched safe source pattern" });
    }
  }

  return deduplicateEvidence(evidence);
}

function collectDependencies(files: readonly SafeRepositorySourceFile[]): DependencyEvidence[] {
  const dependencies: DependencyEvidence[] = [];

  for (const file of files) {
    const baseName = path.posix.basename(file.path).toLowerCase();
    if (baseName === "package.json" || baseName === "composer.json") {
      dependencies.push(...readJsonDependencies(file));
    } else if (baseName === "requirements.txt" || baseName === "requirements-dev.txt") {
      dependencies.push(...readRequirementDependencies(file));
    } else if (baseName === "pyproject.toml" || baseName === "pipfile") {
      dependencies.push(...readTomlLikeDependencies(file));
    } else if (baseName === "gemfile") {
      dependencies.push(...readGemfileDependencies(file));
    } else if (baseName === "cargo.toml") {
      dependencies.push(...readCargoDependencies(file));
    } else if (baseName === "pom.xml" || baseName.endsWith(".gradle") || baseName.endsWith(".gradle.kts")) {
      dependencies.push(...readJvmDependencies(file));
    } else if (baseName.endsWith(".csproj")) {
      dependencies.push(...readDotNetDependencies(file));
    }
  }

  return dependencies;
}

function readJsonDependencies(file: SafeRepositorySourceFile): DependencyEvidence[] {
  try {
    const parsed: unknown = JSON.parse(file.content);
    if (!isRecord(parsed)) return [];
    const sections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies", "require", "require-dev"];
    return sections.flatMap((section) => {
      const value = parsed[section];
      return isRecord(value)
        ? Object.keys(value).map((name) => ({ name: name.toLowerCase(), path: file.path }))
        : [];
    });
  } catch {
    return [];
  }
}

function readRequirementDependencies(file: SafeRepositorySourceFile): DependencyEvidence[] {
  return file.content.split(/\r?\n/u).flatMap((line) => {
    const match = /^\s*([a-zA-Z0-9_.-]+)(?:\[[^\]]+\])?(?:\s*[<>=!~].*)?$/u.exec(line.split("#", 1)[0] ?? "");
    return match?.[1] ? [{ name: match[1].toLowerCase(), path: file.path }] : [];
  });
}

function readTomlLikeDependencies(file: SafeRepositorySourceFile): DependencyEvidence[] {
  return file.content.split(/\r?\n/u).flatMap((line) => {
    const quoted = /^\s*["']?([a-zA-Z0-9_.-]+)["']?\s*(?:=|[<>=!~])/u.exec(line);
    return quoted?.[1] ? [{ name: quoted[1].toLowerCase(), path: file.path }] : [];
  });
}

function readGemfileDependencies(file: SafeRepositorySourceFile): DependencyEvidence[] {
  return [...file.content.matchAll(/^\s*gem\s+["']([^"']+)["']/gmu)].map((match) => ({
    name: (match[1] ?? "").toLowerCase(),
    path: file.path,
  }));
}

function readCargoDependencies(file: SafeRepositorySourceFile): DependencyEvidence[] {
  const dependencySections = extractTomlSections(file.content, ["dependencies", "dev-dependencies", "build-dependencies"]);
  return dependencySections.flatMap((section) =>
    section.split(/\r?\n/u).flatMap((line) => {
      const match = /^\s*([a-zA-Z0-9_-]+)\s*=/u.exec(line);
      return match?.[1] ? [{ name: match[1].toLowerCase(), path: file.path }] : [];
    }),
  );
}

function readJvmDependencies(file: SafeRepositorySourceFile): DependencyEvidence[] {
  const names = new Set<string>();
  for (const match of file.content.matchAll(/<artifactId>([^<]+)<\/artifactId>/gu)) names.add((match[1] ?? "").toLowerCase());
  for (const match of file.content.matchAll(/["']([a-zA-Z0-9_.-]+):([a-zA-Z0-9_.-]+):[^"']+["']/gu)) {
    names.add((match[1] ?? "").toLowerCase());
    names.add((match[2] ?? "").toLowerCase());
  }
  return [...names].map((name) => ({ name, path: file.path }));
}

function readDotNetDependencies(file: SafeRepositorySourceFile): DependencyEvidence[] {
  return [...file.content.matchAll(/<PackageReference\s+Include=["']([^"']+)["']/gu)].map((match) => ({
    name: (match[1] ?? "").toLowerCase(),
    path: file.path,
  }));
}

function detectPackageScripts(files: readonly SafeRepositorySourceFile[]): PackageScript[] {
  return files.flatMap((file) => {
    if (path.posix.basename(file.path).toLowerCase() !== "package.json") return [];
    try {
      const parsed: unknown = JSON.parse(file.content);
      if (!isRecord(parsed) || !isRecord(parsed.scripts)) return [];
      return Object.entries(parsed.scripts).flatMap(([name, command]) =>
        typeof command === "string" ? [{ name, command, sourcePath: file.path }] : [],
      );
    } catch {
      return [];
    }
  });
}

function extractTomlSections(content: string, sectionNames: readonly string[]): string[] {
  const wanted = new Set(sectionNames);
  const sections: string[] = [];
  let current: string[] | null = null;
  for (const line of content.split(/\r?\n/u)) {
    const header = /^\s*\[([^\]]+)\]\s*$/u.exec(line)?.[1];
    if (header !== undefined) {
      if (current !== null) sections.push(current.join("\n"));
      current = wanted.has(header) ? [] : null;
    } else if (current !== null) {
      current.push(line);
    }
  }
  if (current !== null) sections.push(current.join("\n"));
  return sections;
}

function testPattern(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
