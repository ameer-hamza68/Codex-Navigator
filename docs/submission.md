# Hackathon submission summary

## Project

**Codex Navigator Lite**

**Tagline:** Understand an unfamiliar public GitHub repository without running its code.

## Problem

The first minutes in a new repository are often spent locating basic facts: the framework, entry points, authentication, API routes, services, schema, tests, deployment setup, and the files related to an error. Manual browsing is slow, and executing unfamiliar project tooling creates an unnecessary trust risk.

## Solution

Codex Navigator Lite imports a constrained public GitHub snapshot—or a bundled local demo—and turns accepted text files into an evidence-backed navigation workspace. Deterministic TypeScript rules detect the stack, rank important files, generate a conservative architecture diagram, answer repository questions, and connect error signals to likely relevant files.

The application does not use a runtime AI service, semantic embeddings, or automatic code modification. Imported repository code is treated as inert text and is never executed.

## What is implemented

- Validated public GitHub HTTPS import with unauthenticated size preflight.
- Credential-isolated, shallow Git clone with hooks, submodules, tags, LFS downloads, prompts, and inherited Git configuration disabled.
- Path, size, file-count, binary, generated-folder, dependency-folder, secret-name, and high-confidence credential filtering.
- Temporary workspace cleanup and a single-import resource gate.
- Language, framework, package-manager, test, database, authentication, deployment, CI, script, and entry-point detection.
- Evidence-backed important-file ranking and bounded safe excerpts.
- Sanitized Mermaid architecture rendering with a folder fallback.
- Deterministic repository search with confidence, ranking reasons, and line-numbered excerpts.
- Error-signal extraction for paths, symbols, packages, ports, and error codes, followed by related-file ranking and general guidance.
- Loading, failure, and empty states across the main workflow.
- Process-local storage for up to five analyses with six-hour expiry.
- A network-independent Demo Repository flow.

## Demo Repository

The bundled **TaskFlow** fixture is an inert 22-file representation of a Next.js task-management application. It contains:

- Auth.js/NextAuth configuration and protected dashboard pages.
- Task API routes and service functions.
- A Prisma schema with users and tasks.
- A Redis connection configuration.
- Vitest tests and configuration.
- A Dockerfile.

It is processed by the same filtering, detection, ranking, architecture, and search pipeline as GitHub imports. Its analysis is generated at request time rather than stored as a hard-coded result.

## Recommended demo path

1. Run `npm run build` and `npm start`.
2. Open `http://localhost:3000`.
3. Select **Try Demo Repository**.
4. Show Overview, Architecture, and an expanded Important File.
5. Ask `How are tasks created?`.
6. Ask `Which files might cause a Redis connection error?`.
7. Paste a Redis `ECONNREFUSED` stack trace into Error Investigator.
8. Emphasize evidence, uncertainty, and the non-execution boundary.

See [demo-script.md](demo-script.md) for the timed three-minute narration.

## Architecture summary

```text
Browser
  ├─ public URL → metadata preflight → isolated shallow clone ┐
  └─ demo action → bundled inert fixture                       │
                                                               ▼
               shared filtering and static analysis
                              │
                              ▼
                 process-local in-memory store
                              │
                              ▼
             workspace / file / search / error APIs
```

The implementation uses Next.js App Router, React, strict TypeScript, Tailwind CSS, Mermaid, Vitest, Node.js filesystem/process APIs, and in-memory storage. It adds no database, authentication system, vector store, queue, or external AI integration.

## Security and privacy position

- Only public `github.com` HTTPS repository URLs are accepted.
- The host's Git credentials and configuration are not used for imports.
- Imported code is never built, tested, hooked, or executed.
- Files are bounded and filtered before entering the index.
- Repository data remains local to the running server process and is not sent to an AI provider.
- The application is a local hackathon prototype and does not claim production-ready security.

## Known limitations

- No private repository support.
- Network and unauthenticated GitHub API limits affect public imports.
- In-memory analyses disappear on restart and do not span multiple server processes.
- Detection, search, and architecture are rule-based and can miss unfamiliar conventions.
- Architecture relationships are static inferences, not verified runtime traces.
- Secret filtering is conservative but not exhaustive.
- Error investigation ranks evidence and guidance but cannot guarantee a root cause.
- The application never changes repository code.

## How Codex contributed

Codex was used during development to review trust boundaries, identify demo and security blockers, implement scoped fixes, create regression tests, build the bundled demo fixture, run validation commands, and prepare submission documentation. Codex is not part of the runtime analysis path.

## Validation status

The repository includes automated coverage for core filters, detectors, ranking functions, importer boundaries, store lifecycle, API behavior, the demo fixture, requested demo searches, and key demo UI labels.

Submission validation commands:

```sh
npm test
npm run lint
npm run typecheck
npm run build
```
