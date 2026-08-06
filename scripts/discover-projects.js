const fs = require("fs-extra");
const path = require("path");

const GITHUB_API = "https://api.github.com";

// Repos that belong to this pipeline itself — never auto-tag these, even
// though the parent repo legitimately has its own .gitmodules.
const EXCLUDED_REPOS = new Set(["resume-core", "resume-admin", "DevResume-Automation-Pipeline"]);

// Repos that would duplicate an existing hand-written resume.json entry and
// aren't caught by the "already referenced as a submodule" check below.
// Add to this list any time a false positive shows up.
const MANUAL_EXCLUSIONS = new Set([
  "Nexa-G-Bucket-Manager-Mobileapp--CICD", // duplicates the hand-written "Nexa G Bucket Manager" entry
]);

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function fetchJson(url, token, options = {}) {
  const response = await fetch(url, { ...options, headers: authHeaders(token) });
  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status}): ${url} — ${await response.text()}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function listOwnedRepos(owner, token) {
  const repos = [];
  for (let page = 1; ; page++) {
    const batch = await fetchJson(
      `${GITHUB_API}/user/repos?type=owner&per_page=100&page=${page}`,
      token
    );
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos.filter((r) => !r.fork && !r.archived && r.owner.login === owner);
}

async function fetchGitmodulesText(owner, repo, token) {
  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/.gitmodules`, {
    headers: authHeaders(token),
  });
  if (!response.ok) return null;
  const data = await response.json();
  return Buffer.from(data.content, data.encoding).toString("utf8");
}

function parseSubmoduleRepoNames(gitmodulesText) {
  const urls = [...gitmodulesText.matchAll(/url\s*=\s*(\S+)/g)].map((m) => m[1]);
  return urls
    .map((url) => {
      const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
      return match ? { owner: match[1], repo: match[2] } : null;
    })
    .filter(Boolean);
}

// Walks the .gitmodules graph starting from every already-tracked repo so
// that nested meta-repos (a submodule that is itself a meta-repo of further
// submodules — e.g. a microservices "platform" repo) are never mistaken for
// independent, untracked projects.
async function collectTransitiveSubmodules(owner, startRepoNames, token) {
  const known = new Set();
  const queue = [...startRepoNames];

  while (queue.length > 0) {
    const repoName = queue.shift();
    const gitmodulesText = await fetchGitmodulesText(owner, repoName, token);
    if (!gitmodulesText) continue;

    for (const sub of parseSubmoduleRepoNames(gitmodulesText)) {
      if (sub.owner !== owner || known.has(sub.repo)) continue;
      known.add(sub.repo);
      queue.push(sub.repo);
    }
  }

  return known;
}

async function hasGitmodules(owner, repo, token) {
  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/.gitmodules`, {
    headers: authHeaders(token),
  });
  return response.ok;
}

async function addResumeProjectTopic(owner, repo, existingTopics, token) {
  const names = existingTopics.includes("resume-project")
    ? existingTopics
    : [...existingTopics, "resume-project"];

  await fetchJson(`${GITHUB_API}/repos/${owner}/${repo}/topics`, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ names }),
  });
}

async function commitNotifierWorkflow(owner, repo, resumeCoreOwner, resumeCoreRepo, token) {
  const notifierPath = ".github/workflows/notify-resume.yml";
  const content = `# Auto-provisioned by resume-core's discover-projects workflow.
# Notifies ${resumeCoreOwner}/${resumeCoreRepo} whenever this repo's default
# branch is pushed to. Add the "resume-ready" topic (Settings -> topic tags)
# once this project is actually presentable — pushes are ignored until then.
#
# Required secret in THIS repo: RESUME_CORE_PAT (fine-grained PAT scoped to
# trigger repository_dispatch on ${resumeCoreOwner}/${resumeCoreRepo}).

name: Notify Resume Pipeline

on:
  push:
    branches: [main, master]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Dispatch resume_update event to resume-core
        uses: peter-evans/repository-dispatch@v3
        with:
          token: \${{ secrets.RESUME_CORE_PAT }}
          repository: ${resumeCoreOwner}/${resumeCoreRepo}
          event-type: resume_update
          client-payload: |-
            {
              "repo_owner": "\${{ github.repository_owner }}",
              "repo_name": "\${{ github.event.repository.name }}"
            }
`;

  let existingSha;
  try {
    const existing = await fetchJson(
      `${GITHUB_API}/repos/${owner}/${repo}/contents/${notifierPath}`,
      token
    );
    existingSha = existing.sha;
  } catch {
    // File doesn't exist yet — that's expected for a fresh repo.
  }

  if (existingSha) {
    return false; // already wired up, don't touch it
  }

  await fetchJson(`${GITHUB_API}/repos/${owner}/${repo}/contents/${notifierPath}`, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: "feat: add resume-core notifier workflow (auto-provisioned)",
      content: Buffer.from(content, "utf8").toString("base64"),
    }),
  });
  return true;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.REPO_OWNER;
  const resumeCoreOwner = process.env.RESUME_CORE_OWNER || owner;
  const resumeCoreRepo = process.env.RESUME_CORE_REPO || "resume-core";

  if (!token || !owner) {
    throw new Error("GITHUB_TOKEN and REPO_OWNER are required.");
  }

  const repos = await listOwnedRepos(owner, token);
  console.log(`Scanning ${repos.length} owned repositories for meta-repos with .gitmodules...`);

  const trackedRepoNames = repos.filter((r) => (r.topics || []).includes("resume-project")).map((r) => r.name);
  const knownSubmodules = await collectTransitiveSubmodules(owner, trackedRepoNames, token);
  if (knownSubmodules.size > 0) {
    console.log(
      `Repos already represented as submodules of a tracked project (skipping): ${[...knownSubmodules].join(", ")}`
    );
  }

  const newlyWired = [];
  const missingSecret = [];

  for (const repo of repos) {
    if (EXCLUDED_REPOS.has(repo.name)) continue;
    if (MANUAL_EXCLUSIONS.has(repo.name)) continue;
    if (knownSubmodules.has(repo.name)) continue;

    const topics = repo.topics || [];
    if (topics.includes("resume-project")) continue;

    const isMetaRepo = await hasGitmodules(owner, repo.name, token);
    if (!isMetaRepo) continue;

    console.log(`Found untracked meta-repo: ${repo.name} — adding resume-project topic.`);
    await addResumeProjectTopic(owner, repo.name, topics, token);

    const workflowAdded = await commitNotifierWorkflow(owner, repo.name, resumeCoreOwner, resumeCoreRepo, token);
    if (workflowAdded) {
      console.log(`  -> committed notify-resume.yml to ${repo.name}`);
    }

    newlyWired.push(repo.name);
    missingSecret.push(repo.name);
  }

  const summary = { newlyWired, missingSecret, skippedAsNestedSubmodule: [...knownSubmodules] };
  await fs.writeJson(path.join(process.cwd(), "discovery-summary.json"), summary, { spaces: 2 });

  if (newlyWired.length === 0) {
    console.log("No new meta-repos found. Nothing to do.");
  } else {
    console.log(`\nWired up ${newlyWired.length} repo(s): ${newlyWired.join(", ")}`);
    console.log(
      `\nStill needed for each — a RESUME_CORE_PAT secret (Settings -> Secrets and variables -> Actions):\n` +
        missingSecret.map((r) => `  - ${r}`).join("\n")
    );
  }
}

main().catch((error) => {
  console.error("discover-projects.js failed:", error);
  process.exit(1);
});
