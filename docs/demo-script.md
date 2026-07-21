# Three-minute demo script

This script uses the bundled Demo Repository so the presentation does not depend on GitHub availability or API rate limits.

## 0:00–0:20 — Opening

**On screen:** Landing page.

**Say:**

> “Codex Navigator Lite helps a developer understand an unfamiliar public repository without executing its code. It builds an evidence-backed map of the stack, important files, architecture, and likely files related to a question or error.”

## 0:20–0:40 — Problem and boundary

**Point to:** Public repository input and safety note.

**Say:**

> “Repository onboarding is usually a scavenger hunt across manifests, routes, services, schemas, tests, and deployment files. This prototype shortens that first pass with deterministic local analysis. There is no runtime AI, no private-repository access, and no execution of imported code.”

## 0:40–1:00 — Start the reliable demo

**Action:** Select **Try Demo Repository**.

**Say:**

> “For a reliable demonstration, I am using the bundled TaskFlow fixture. It is an inert 22-file Next.js task-management repository, and it goes through the same filtering and analysis engine as a GitHub import. Its final analysis is generated now, not hard-coded.”

**Expected:** The TaskFlow workspace opens quickly.

## 1:00–1:25 — Overview

**On screen:** Overview.

**Point to:** Stack badges, entry points, authentication, database, tests, deployment, and scripts.

**Say:**

> “The engine found Next.js and React, Auth.js/NextAuth, Prisma, Vitest, and Docker from manifests, source patterns, and conventional paths. Every detection can be expanded to show its evidence.”

## 1:25–1:50 — Architecture

**Action:** Open **Architecture**.

**Say:**

> “The architecture view is a bounded Mermaid diagram built from observed components and important-file evidence. It is a conservative static map, not a claim about verified runtime call flow. Repository-controlled labels are sanitized before strict-mode rendering.”

## 1:50–2:10 — Important files

**Action:** Open **Important Files** and expand `src/app/api/tasks/route.ts` or `src/services/task-service.ts`.

**Say:**

> “Important files are ranked by transparent rules such as framework conventions, folder names, imports, and exported symbols. Here we can see why the file was selected and a safe, bounded source excerpt.”

## 2:10–2:40 — Ask the repository

**Action:** Open **Repository Search**.

**Select:** `How are tasks created?`

**Say:**

> “Search combines paths, categories, symbols, technology evidence, and lexical content. The task form, API route, and service are ranked with reasons and line-numbered excerpts.”

**Select:** `Which files might cause a Redis connection error?`

**Say:**

> “The Redis configuration ranks first because its path and content directly match the question. This is deterministic relevance ranking, not semantic embeddings.”

## 2:40–2:55 — Error investigation

**Action:** Open **Error Investigator** and paste:

```text
Error: connect ECONNREFUSED 127.0.0.1:6379
    at RedisConnector (src/config/redis.ts:4:12)
```

**Say:**

> “The investigator extracts the port, path, symbol, and error code, then searches the existing safe index. It provides guidance and candidate files, not a guaranteed root cause or an automatic code change.”

## 2:55–3:00 — Close

**Return to:** The highest-ranked Redis result or Overview.

**Say:**

> “Codex Navigator Lite turns an unfamiliar repository into an inspectable starting point in seconds—locally, safely, and with evidence instead of hidden guesses.”

## Presenter backup notes

- Use `npm run build` followed by `npm start` for the most stable local presentation.
- Keep the bundled demo as the primary path; demonstrate a public GitHub import only if network conditions allow.
- If a search result is low-confidence, use that state to show that the product reports uncertainty rather than inventing an answer.
- Do not describe the architecture edges as proven runtime calls.
- Do not promise private repository support, automatic fixes, semantic search, or guaranteed diagnosis.
