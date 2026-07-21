import type { ImportantFile, RepositorySearchResponse } from "../domain/repository-analysis";
import type { SafeRepositorySourceFile, TechnologyDetection } from "../analysis/technology-detector";
import { searchRepository } from "./repository-search";

export interface ErrorSignals {
  paths: string[];
  symbols: string[];
  packages: string[];
  ports: string[];
  errorCodes: string[];
}

export interface ErrorInvestigationResponse {
  signals: ErrorSignals;
  search: RepositorySearchResponse;
  guidance: string[];
  disclaimer: string;
}

const MAX_ERROR_LENGTH = 20_000;

export function investigateRepositoryError(
  errorText: string,
  files: readonly SafeRepositorySourceFile[],
  technologies: Pick<
    TechnologyDetection,
    "frameworks" | "testTools" | "databaseTools" | "authenticationTools" | "deploymentTools" | "ciTools"
  >,
  importantFiles: readonly ImportantFile[],
): ErrorInvestigationResponse {
  const boundedError = errorText.slice(0, MAX_ERROR_LENGTH);
  const signals = extractErrorSignals(boundedError);
  const terms = [
    ...signals.paths,
    ...signals.symbols,
    ...signals.packages,
    ...signals.errorCodes,
    boundedError.split(/\r?\n/u).slice(0, 4).join(" "),
  ].join(" ");
  const search = searchRepository(terms, files, technologies, importantFiles, {
    maxResults: 8,
    maxExcerptsPerFile: 2,
    excerptContextLines: 2,
    minimumScore: 10,
  });
  return {
    signals,
    search,
    guidance: buildGuidance(signals),
    disclaimer: "Investigation guidance only — these matches are not a guaranteed root cause.",
  };
}

export function extractErrorSignals(errorText: string): ErrorSignals {
  return {
    paths: uniqueMatches(errorText, /(?:[a-zA-Z]:[\\/]|\.?\.?[\\/])?[\w@.-]+(?:[\\/][\w@.-]+)+\.[a-zA-Z0-9]+/gu)
      .map((value) => value.replaceAll("\\", "/")),
    symbols: uniqueMatches(errorText, /\b(?:[A-Z][A-Za-z0-9_]*(?:Error|Exception)|at\s+([A-Za-z_$][\w$.]*))\b/gu)
      .map((value) => value.replace(/^at\s+/u, "")),
    packages: uniqueCaptures(errorText, [
      /node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/\s]+)/gu,
      /(?:cannot find (?:module|package)|package)\s+["']([^"']+)["']/giu,
    ]),
    ports: uniqueCaptures(errorText, [/(?:\bport\s+|localhost:|127\.0\.0\.1:)(\d{2,5})\b/giu]),
    errorCodes: uniqueMatches(errorText, /\b(?:E[A-Z][A-Z0-9_]{2,}|[45]\d{2}|[A-Z][A-Za-z0-9_]*(?:Error|Exception))\b/gu),
  };
}

function buildGuidance(signals: ErrorSignals): string[] {
  const guidance = ["Start with the highest-ranked file and verify the matched lines against the full stack trace."];
  if (signals.paths.length > 0) guidance.push("Check whether referenced paths still exist and whether aliases resolve to the same files.");
  if (signals.packages.length > 0) guidance.push("Compare the referenced package with its manifest entry, version, and initialization code.");
  if (signals.ports.length > 0) guidance.push("Confirm the configured port is available and matches the client, server, and deployment settings.");
  if (signals.errorCodes.length > 0) guidance.push("Trace the first occurrence of the error code; later stack frames may be secondary failures.");
  return guidance;
}

function uniqueMatches(value: string, pattern: RegExp): string[] {
  return [...new Set(value.match(pattern) ?? [])].slice(0, 12);
}

function uniqueCaptures(value: string, patterns: readonly RegExp[]): string[] {
  const matches = patterns.flatMap((pattern) => [...value.matchAll(pattern)].flatMap((match) => match[1] === undefined ? [] : [match[1]]));
  return [...new Set(matches)].slice(0, 12);
}
