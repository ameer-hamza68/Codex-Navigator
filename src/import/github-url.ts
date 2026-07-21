export interface GitHubRepositoryLocation {
  owner: string;
  repository: string;
  cloneUrl: string;
}

export type GitHubUrlValidation =
  | { valid: true; location: GitHubRepositoryLocation }
  | { valid: false; message: string };

const OWNER_PATTERN = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/u;
const REPOSITORY_PATTERN = /^[a-zA-Z0-9._-]{1,100}$/u;

export function validatePublicGitHubUrl(input: string): GitHubUrlValidation {
  if (input.trim() !== input || input.length === 0) {
    return invalid("Enter a complete public GitHub HTTPS repository URL.");
  }

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return invalid("The repository URL is malformed.");
  }

  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com" || url.port !== "") {
    return invalid("Only HTTPS repository URLs on github.com are supported.");
  }
  if (url.username !== "" || url.password !== "") {
    return invalid("Repository URLs must not contain credentials.");
  }
  if (url.search !== "" || url.hash !== "") {
    return invalid("Repository URLs must not contain query parameters or fragments.");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) {
    return invalid("Use a repository URL in the form https://github.com/owner/repository.");
  }
  const owner = segments[0] ?? "";
  const rawRepository = segments[1] ?? "";
  const repository = rawRepository.toLowerCase().endsWith(".git") ? rawRepository.slice(0, -4) : rawRepository;
  if (!OWNER_PATTERN.test(owner) || !REPOSITORY_PATTERN.test(repository) || repository === "." || repository === "..") {
    return invalid("The GitHub owner or repository name is invalid.");
  }

  return {
    valid: true,
    location: {
      owner,
      repository,
      cloneUrl: `https://github.com/${owner}/${repository}.git`,
    },
  };
}

function invalid(message: string): GitHubUrlValidation {
  return { valid: false, message };
}
