# Codex Navigator Lite

## Project

Codex Navigator Lite is a one-day hackathon project for analyzing public GitHub repositories.

## Technical stack

- Next.js App Router
- TypeScript with strict mode
- Tailwind CSS
- Vitest
- Local filesystem or in-memory storage only

## Engineering rules

- Keep the architecture simple and appropriate for a one-day hackathon.
- Do not add databases, authentication, Docker, vector databases, external AI APIs, queues, or unnecessary dependencies.
- Never execute code, scripts, hooks, builds, tests, or binaries from imported repositories.
- Do not read `.env` files, private keys, certificates, credentials, binary files, generated folders, or dependency folders from imported repositories.
- Prefer pure TypeScript functions for repository analysis.
- Every core parser, detector, filter, and ranking function requires tests.
- API responses must use typed schemas.
- Return useful, actionable errors rather than silently failing.
- Keep components small and accessible.
- Do not modify unrelated files.
- Before finishing a task, run type checking, linting, and relevant tests.

## Commands

```sh
npm run dev
npm run lint
npm run typecheck
npm test
```

## MVP priorities

Work in this order unless the user explicitly requests otherwise:

1. Repository import
2. File filtering and indexing
3. Project detection
4. Important-file detection
5. Repository search
6. Architecture visualization
7. UI polish

## Definition of done

A task is complete when:

- The requested feature works.
- Relevant tests pass.
- Type checking passes.
- The final response includes a concise summary of changed files and remaining limitations.
