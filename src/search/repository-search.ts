import path from "node:path";

import type {
  DetectionResult,
  ImportantFile,
  ImportantFileCategory,
  RepositorySearchResponse,
  SearchExcerpt,
  SearchResult,
} from "../domain/repository-analysis";
import type { SafeRepositorySourceFile, TechnologyDetection } from "../analysis/technology-detector";

export interface RepositorySearchOptions {
  maxResults: number;
  maxExcerptsPerFile: number;
  excerptContextLines: number;
  minimumScore: number;
}

interface QueryModel {
  normalized: string;
  originalTerms: ReadonlySet<string>;
  expandedTerms: ReadonlySet<string>;
  categories: ReadonlySet<ImportantFileCategory>;
}

interface ScoredReason {
  points: number;
  text: string;
}

interface ScoredFile {
  file: SafeRepositorySourceFile;
  score: number;
  reasons: ScoredReason[];
  matchedTerms: string[];
}

export const DEFAULT_REPOSITORY_SEARCH_OPTIONS: Readonly<RepositorySearchOptions> = {
  maxResults: 8,
  maxExcerptsPerFile: 2,
  excerptContextLines: 2,
  minimumScore: 12,
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "do", "does", "file", "files", "for", "handle", "handles", "how", "i",
  "implemented", "in", "is", "located", "of", "please", "repository", "the", "this", "to", "what", "where",
  "which", "with",
]);

export const DEVELOPER_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  auth: ["auth", "authentication", "login", "session", "token", "middleware"],
  database: ["database", "db", "prisma", "schema", "model", "repository"],
  api: ["api", "route", "controller", "endpoint", "service"],
  test: ["test", "tests", "spec", "specs", "pytest", "vitest", "jest", "xctest"],
  payment: ["payment", "checkout", "billing", "stripe", "order"],
};

const CONCEPT_CATEGORIES: Readonly<Record<string, readonly ImportantFileCategory[]>> = {
  auth: ["authentication"],
  database: ["database"],
  api: ["api", "routing", "services"],
  test: ["test"],
  payment: ["services", "api"],
};

export function searchRepository(
  question: string,
  files: readonly SafeRepositorySourceFile[],
  technologies: Pick<
    TechnologyDetection,
    "frameworks" | "testTools" | "databaseTools" | "authenticationTools" | "deploymentTools" | "ciTools"
  >,
  importantFiles: readonly ImportantFile[],
  options: Readonly<RepositorySearchOptions> = DEFAULT_REPOSITORY_SEARCH_OPTIONS,
): RepositorySearchResponse {
  const query = buildQueryModel(question);
  if (query.originalTerms.size === 0) {
    return lowConfidenceResponse(query.normalized, "No meaningful search terms were found in the question.");
  }

  const importantByPath = groupImportantFiles(importantFiles);
  const technologyByPath = groupTechnologyEvidence(technologies);
  const scored = files
    .map((file) => scoreFile(file, query, importantByPath, technologyByPath))
    .filter((file) => file.score >= options.minimumScore)
    .sort((left, right) => right.score - left.score || normalizePath(left.file.path).localeCompare(normalizePath(right.file.path)))
    .slice(0, options.maxResults);

  if (scored.length === 0) {
    return lowConfidenceResponse(query.normalized, "No repository files had a meaningful lexical match for this question.");
  }

  const results = scored.map((item) => toSearchResult(item, options));
  const confidence = scoreToConfidence(results[0]?.score ?? 0);
  return {
    normalizedQuestion: query.normalized,
    confidence,
    message: confidence === "low"
      ? "Only weak lexical matches were found; review these files cautiously."
      : `Found ${results.length} relevant ${results.length === 1 ? "file" : "files"} using rule-based search.`,
    results,
  };
}

export function normalizeQuestion(question: string): string {
  return question
    .normalize("NFKC")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9_./@#-]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

/** Escapes repository-controlled text before it is returned for browser display. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildQueryModel(question: string): QueryModel {
  const normalized = normalizeQuestion(question);
  const terms = tokenize(normalized).filter((term) => !STOP_WORDS.has(term));
  const originalTerms = new Set(terms);
  const expandedTerms = new Set(terms);
  const categories = new Set<ImportantFileCategory>();

  for (const [concept, synonyms] of Object.entries(DEVELOPER_SYNONYMS)) {
    if (synonyms.some((synonym) => originalTerms.has(synonym))) {
      synonyms.forEach((synonym) => expandedTerms.add(synonym));
      CONCEPT_CATEGORIES[concept]?.forEach((category) => categories.add(category));
    }
  }

  return { normalized, originalTerms, expandedTerms, categories };
}

function scoreFile(
  file: SafeRepositorySourceFile,
  query: QueryModel,
  importantByPath: ReadonlyMap<string, readonly ImportantFile[]>,
  technologyByPath: ReadonlyMap<string, readonly string[]>,
): ScoredFile {
  const normalizedPath = normalizePath(file.path);
  const lowerPath = normalizedPath.toLowerCase();
  const baseName = path.posix.basename(lowerPath);
  const stem = baseName.slice(0, Math.max(0, baseName.length - path.posix.extname(baseName).length));
  const pathTerms = new Set(tokenize(lowerPath));
  const fileTerms = new Set(tokenize(stem));
  const folderTerms = new Set(lowerPath.split("/").slice(0, -1).flatMap(tokenize));
  const symbols = extractSymbols(file.content);
  const contentTerms = new Set(tokenize(file.content));
  const important = importantByPath.get(lowerPath) ?? [];
  const reasons: ScoredReason[] = [];
  const matchedTerms = new Set<string>();

  if (query.normalized.includes(lowerPath) || query.normalized.includes(baseName)) {
    reasons.push({ points: 80, text: `Question contains the exact path or filename ${escapeHtml(normalizedPath)}` });
  }

  const filenameMatches = intersect(query.expandedTerms, fileTerms);
  if (filenameMatches.length > 0) {
    filenameMatches.forEach((term) => matchedTerms.add(term));
    reasons.push({ points: 34 + filenameMatches.length * 4, text: `Filename matches ${formatTerms(filenameMatches)}` });
  }

  const pathMatches = intersect(query.expandedTerms, pathTerms).filter((term) => !fileTerms.has(term));
  if (pathMatches.length > 0) {
    pathMatches.forEach((term) => matchedTerms.add(term));
    reasons.push({ points: 24 + pathMatches.length * 3, text: `Path matches ${formatTerms(pathMatches)}` });
  }

  const folderMatches = intersect(query.expandedTerms, folderTerms);
  if (folderMatches.length > 0) {
    folderMatches.forEach((term) => matchedTerms.add(term));
    reasons.push({ points: 18 + folderMatches.length * 3, text: `Folder matches ${formatTerms(folderMatches)}` });
  }

  const matchedCategories = important.filter((classification) => query.categories.has(classification.category));
  if (matchedCategories.length > 0) {
    const categoryNames = [...new Set(matchedCategories.map((item) => item.category))];
    reasons.push({ points: 30 + categoryNames.length * 4, text: `Important-file category matches ${formatTerms(categoryNames)}` });
  }

  const symbolMatches = intersect(query.expandedTerms, symbols);
  if (symbolMatches.length > 0) {
    symbolMatches.forEach((term) => matchedTerms.add(term));
    reasons.push({ points: 26 + symbolMatches.length * 5, text: `Exported symbol matches ${formatTerms(symbolMatches)}` });
  }

  const originalContentMatches = intersect(query.originalTerms, contentTerms);
  const expandedContentMatches = intersect(query.expandedTerms, contentTerms).filter((term) => !query.originalTerms.has(term));
  [...originalContentMatches, ...expandedContentMatches].forEach((term) => matchedTerms.add(term));
  if (originalContentMatches.length > 0) {
    reasons.push({ points: Math.min(30, 10 + originalContentMatches.length * 7), text: `Content matches ${formatTerms(originalContentMatches)}` });
  }
  if (expandedContentMatches.length > 0) {
    reasons.push({ points: Math.min(18, 5 + expandedContentMatches.length * 3), text: `Content matches related terms ${formatTerms(expandedContentMatches)}` });
  }

  const technologyMatches = (technologyByPath.get(lowerPath) ?? []).filter((name) =>
    tokenize(name).some((term) => query.expandedTerms.has(term)),
  );
  if (technologyMatches.length > 0) {
    reasons.push({ points: 10, text: `Provides evidence for detected technology ${escapeHtml(technologyMatches[0] ?? "")}` });
  }

  const isTestFile = important.some((classification) => classification.category === "test");
  if (isTestFile && !query.categories.has("test")) {
    reasons.push({ points: -45, text: "Lower priority because this is a test file and the question is not about tests" });
  }

  return {
    file,
    score: reasons.reduce((total, reason) => total + reason.points, 0),
    reasons,
    matchedTerms: [...matchedTerms].sort(),
  };
}

function toSearchResult(item: ScoredFile, options: Readonly<RepositorySearchOptions>): SearchResult {
  const normalizedPath = normalizePath(item.file.path);
  return {
    path: normalizedPath,
    displayPath: escapeHtml(normalizedPath),
    score: item.score,
    confidence: scoreToConfidence(item.score),
    reasons: item.reasons
      .sort((left, right) => right.points - left.points || left.text.localeCompare(right.text))
      .map((reason) => reason.text),
    excerpts: buildExcerpts(item.file.content, item.matchedTerms, options),
  };
}

function buildExcerpts(
  content: string,
  matchedTerms: readonly string[],
  options: Readonly<RepositorySearchOptions>,
): SearchExcerpt[] {
  const lines = content.split(/\r?\n/u);
  if (lines.length === 0) return [];
  const scoredLines = lines
    .map((line, index) => ({
      index,
      terms: matchedTerms.filter((term) => tokenize(line).includes(term)),
    }))
    .filter((line) => line.terms.length > 0)
    .sort((left, right) => right.terms.length - left.terms.length || left.index - right.index);
  const anchors = scoredLines.length > 0 ? scoredLines : [{ index: 0, terms: [] }];
  const excerpts: SearchExcerpt[] = [];

  for (const anchor of anchors) {
    const start = Math.max(0, anchor.index - options.excerptContextLines);
    const end = Math.min(lines.length - 1, anchor.index + options.excerptContextLines);
    if (excerpts.some((excerpt) => start + 1 <= excerpt.endLine && end + 1 >= excerpt.startLine)) continue;
    excerpts.push({
      startLine: start + 1,
      endLine: end + 1,
      text: escapeHtml(lines.slice(start, end + 1).join("\n")),
      matchedTerms: anchor.terms,
    });
    if (excerpts.length >= options.maxExcerptsPerFile) break;
  }

  return excerpts;
}

function extractSymbols(content: string): Set<string> {
  const symbols = new Set<string>();
  const patterns = [
    /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gu,
    /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/gmu,
    /^\s*class\s+([A-Za-z_]\w*)/gmu,
    /\b(?:public\s+)?(?:class|struct|func|fun)\s+([A-Za-z_]\w*)/gu,
  ];
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1] !== undefined) tokenize(match[1]).forEach((term) => symbols.add(term));
    }
  }
  return symbols;
}

function groupImportantFiles(files: readonly ImportantFile[]): Map<string, ImportantFile[]> {
  const grouped = new Map<string, ImportantFile[]>();
  for (const file of files) {
    const key = normalizePath(file.path).toLowerCase();
    grouped.set(key, [...(grouped.get(key) ?? []), file]);
  }
  return grouped;
}

function groupTechnologyEvidence(
  technologies: Pick<
    TechnologyDetection,
    "frameworks" | "testTools" | "databaseTools" | "authenticationTools" | "deploymentTools" | "ciTools"
  >,
): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  const groups: readonly DetectionResult[][] = [
    technologies.frameworks,
    technologies.testTools,
    technologies.databaseTools,
    technologies.authenticationTools,
    technologies.deploymentTools,
    technologies.ciTools,
  ];
  for (const detection of groups.flat()) {
    for (const evidence of detection.evidence) {
      const key = normalizePath(evidence.path).toLowerCase();
      grouped.set(key, [...new Set([...(grouped.get(key) ?? []), detection.name])]);
    }
  }
  return grouped;
}

function tokenize(value: string): string[] {
  return value
    .normalize("NFKC")
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9_@#-]+/u)
    .flatMap((term) => term.split(/[_-]+/u))
    .filter((term) => term.length > 1);
}

function intersect(terms: ReadonlySet<string>, candidates: ReadonlySet<string>): string[] {
  return [...terms].filter((term) => candidates.has(term)).sort();
}

function formatTerms(terms: readonly string[]): string {
  return terms.map((term) => `“${escapeHtml(term)}”`).join(", ");
}

function normalizePath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

function scoreToConfidence(score: number): "high" | "medium" | "low" {
  if (score >= 70) return "high";
  if (score >= 35) return "medium";
  return "low";
}

function lowConfidenceResponse(normalizedQuestion: string, message: string): RepositorySearchResponse {
  return { normalizedQuestion, confidence: "low", message, results: [] };
}
