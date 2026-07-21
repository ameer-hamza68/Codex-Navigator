import { describe, expect, it } from "vitest";

import { validatePublicGitHubUrl } from "../src/import/github-url";

describe("validatePublicGitHubUrl", () => {
  it("normalizes valid public GitHub HTTPS URLs", () => {
    expect(validatePublicGitHubUrl("https://github.com/openai/codex")).toEqual({
      valid: true,
      location: { owner: "openai", repository: "codex", cloneUrl: "https://github.com/openai/codex.git" },
    });
    expect(validatePublicGitHubUrl("https://github.com/openai/codex.git")).toMatchObject({ valid: true });
  });

  it.each([
    "http://github.com/openai/codex",
    "https://gitlab.com/openai/codex",
    "https://user:token@github.com/openai/codex",
    "https://github.com/openai/codex?token=secret",
    "https://github.com/openai/codex#readme",
    "file:///C:/repositories/codex",
    "C:\\repositories\\codex",
    "../codex",
    "git@github.com:openai/codex.git",
    "https://github.com/openai/codex/tree/main",
    "not a url",
  ])("rejects unsafe or unsupported URL %s", (url) => {
    expect(validatePublicGitHubUrl(url).valid).toBe(false);
  });
});
