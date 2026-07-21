import type { RepositorySourceFile } from "../import/repository-importer";

export const DEMO_REPOSITORY = {
  owner: "demo",
  name: "taskflow-next",
  files: [
    {
      path: "README.md",
      content: `# TaskFlow

TaskFlow is a small Next.js task-management application with authenticated dashboards,
API routes, Prisma persistence, Redis-backed task caching, and Vitest coverage.`,
    },
    {
      path: "package.json",
      content: JSON.stringify({
        name: "taskflow-next",
        private: true,
        scripts: {
          dev: "next dev",
          build: "next build",
          test: "vitest run",
        },
        dependencies: {
          "@prisma/client": "6.0.0",
          ioredis: "5.4.1",
          next: "15.0.0",
          "next-auth": "5.0.0-beta.25",
          react: "19.0.0",
          "react-dom": "19.0.0",
        },
        devDependencies: {
          prisma: "6.0.0",
          vitest: "3.0.0",
        },
      }, null, 2),
    },
    {
      path: "src/app/layout.tsx",
      content: `import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}`,
    },
    {
      path: "src/app/page.tsx",
      content: `export default function HomePage() {
  return <main><h1>TaskFlow</h1><a href="/dashboard">Open dashboard</a></main>;
}`,
    },
    {
      path: "src/app/login/page.tsx",
      content: `export default function LoginPage() {
  return <main><h1>Sign in</h1><form action="/api/auth/signin"><button>Continue</button></form></main>;
}`,
    },
    {
      path: "src/app/dashboard/layout.tsx",
      content: `import type { ReactNode } from "react";
import { requireSession } from "../../services/session-service";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return <section><nav>Dashboard · Tasks · Team</nav>{children}</section>;
}`,
    },
    {
      path: "src/app/dashboard/page.tsx",
      content: `import { listTasks } from "../../services/task-service";

export default async function DashboardPage() {
  const tasks = await listTasks();
  return <main><h1>Task dashboard</h1><p>{tasks.length} tasks</p></main>;
}`,
    },
    {
      path: "src/app/dashboard/tasks/page.tsx",
      content: `export default function TasksPage() {
  return <main><h1>Tasks</h1><form action="/api/tasks" method="post"><input name="title" /><button>Create task</button></form></main>;
}`,
    },
    {
      path: "src/app/api/auth/[...nextauth]/route.ts",
      content: `import NextAuth from "next-auth";
import { authConfig } from "../../../../auth/config";

export const { GET, POST } = NextAuth(authConfig);`,
    },
    {
      path: "src/auth/config.ts",
      content: `import type { NextAuthConfig } from "next-auth";
import GitHub from "next-auth/providers/github";

export const authConfig = {
  providers: [GitHub],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
} satisfies NextAuthConfig;`,
    },
    {
      path: "src/middleware.ts",
      content: `export { auth as middleware } from "./auth/config";

export const config = { matcher: ["/dashboard/:path*"] };`,
    },
    {
      path: "src/app/api/tasks/route.ts",
      content: `import { createTask, listTasks } from "../../../services/task-service";
import { requireSession } from "../../../services/session-service";

export async function GET() {
  const session = await requireSession();
  return Response.json(await listTasks(session.user.id));
}

export async function POST(request: Request) {
  const session = await requireSession();
  const body = await request.json() as { title: string };
  const createdTask = await createTask({ title: body.title, ownerId: session.user.id });
  return Response.json({ task: createdTask }, { status: 201 });
}`,
    },
    {
      path: "src/app/api/tasks/[id]/route.ts",
      content: `import { completeTask } from "../../../../services/task-service";

export async function PATCH(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return Response.json(await completeTask(id));
}`,
    },
    {
      path: "src/services/task-service.ts",
      content: `import { prisma } from "../lib/prisma";
import { redis } from "../config/redis";

export async function createTask(input: { title: string; ownerId: string }) {
  const createdTask = await prisma.task.create({ data: input });
  await redis.del("tasks:" + input.ownerId);
  return createdTask;
}

export async function listTasks(ownerId?: string) {
  return prisma.task.findMany({ where: ownerId ? { ownerId } : undefined });
}

export async function completeTask(id: string) {
  return prisma.task.update({ where: { id }, data: { completed: true } });
}`,
    },
    {
      path: "src/services/session-service.ts",
      content: `import { auth } from "../auth/config";

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Authentication required");
  return session as { user: { id: string } };
}`,
    },
    {
      path: "src/lib/prisma.ts",
      content: `import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();`,
    },
    {
      path: "src/config/redis.ts",
      content: `import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redis = new Redis(redisUrl, {
  connectTimeout: 5_000,
  maxRetriesPerRequest: 2,
  retryStrategy: (attempt) => Math.min(attempt * 100, 2_000),
});

redis.on("error", (error) => console.error("Redis connection error", error));`,
    },
    {
      path: "prisma/schema.prisma",
      content: `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id    String @id @default(cuid())
  email String @unique
  tasks Task[]
}

model Task {
  id        String   @id @default(cuid())
  title     String
  completed Boolean  @default(false)
  ownerId   String
  owner     User     @relation(fields: [ownerId], references: [id])
  createdAt DateTime @default(now())
}`,
    },
    {
      path: "tests/task-service.test.ts",
      content: `import { describe, expect, it, vi } from "vitest";
import { createTask } from "../src/services/task-service";

describe("createTask", () => {
  it("creates a task and invalidates the owner's Redis cache", async () => {
    vi.stubGlobal("taskTitle", "Ship the demo");
    await expect(createTask({ title: "Ship the demo", ownerId: "user-1" })).resolves.toBeDefined();
  });
});`,
    },
    {
      path: "tests/auth-config.test.ts",
      content: `import { describe, expect, it } from "vitest";
import { authConfig } from "../src/auth/config";

describe("authConfig", () => {
  it("uses the custom login page", () => expect(authConfig.pages?.signIn).toBe("/login"));
});`,
    },
    {
      path: "vitest.config.ts",
      content: `import { defineConfig } from "vitest/config";

export default defineConfig({ test: { environment: "node" } });`,
    },
    {
      path: "Dockerfile",
      content: `FROM node:22-alpine AS runner
WORKDIR /app
COPY .next/standalone ./
COPY .next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]`,
    },
  ] satisfies readonly RepositorySourceFile[],
} as const;
