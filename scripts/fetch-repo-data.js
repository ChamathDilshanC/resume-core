const fs = require("fs-extra");
const path = require("path");

const GITHUB_API = "https://api.github.com";

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function fetchJson(url, token) {
  const response = await fetch(url, { headers: authHeaders(token) });
  if (!response.ok) {
    throw new Error(`GitHub API request failed (${response.status}): ${url}`);
  }
  return response.json();
}

async function repoExists(owner, repo, token) {
  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/contents/.gitmodules`, {
    headers: authHeaders(token),
  });
  return response.ok;
}

async function fetchGitmodules(owner, repo, token) {
  const data = await fetchJson(`${GITHUB_API}/repos/${owner}/${repo}/contents/.gitmodules`, token);
  return Buffer.from(data.content, data.encoding).toString("utf8");
}

function parseSubmoduleOwnerRepo(gitmodulesText) {
  const urls = [...gitmodulesText.matchAll(/url\s*=\s*(\S+)/g)].map((m) => m[1]);
  return urls
    .map((url) => {
      const match = url.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
      if (!match) return null;
      return { owner: match[1], repo: match[2] };
    })
    .filter(Boolean);
}

async function fetchLanguages(owner, repo, token) {
  try {
    const data = await fetchJson(`${GITHUB_API}/repos/${owner}/${repo}/languages`, token);
    return Object.keys(data);
  } catch (error) {
    console.warn(`Could not fetch languages for ${owner}/${repo}: ${error.message}`);
    return [];
  }
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.SOURCE_REPO_OWNER;
  const repo = process.env.SOURCE_REPO_NAME;

  if (!token || !owner || !repo) {
    throw new Error("GITHUB_TOKEN, SOURCE_REPO_OWNER, and SOURCE_REPO_NAME are required.");
  }

  const repoDetails = await fetchJson(`${GITHUB_API}/repos/${owner}/${repo}`, token);
  const languageSet = new Set(await fetchLanguages(owner, repo, token));

  const hasGitmodules = await repoExists(owner, repo, token);
  if (hasGitmodules) {
    console.log("Detected .gitmodules — aggregating submodule tech stacks.");
    const gitmodulesText = await fetchGitmodules(owner, repo, token);
    const submodules = parseSubmoduleOwnerRepo(gitmodulesText);
    for (const submodule of submodules) {
      const submoduleLanguages = await fetchLanguages(submodule.owner, submodule.repo, token);
      submoduleLanguages.forEach((lang) => languageSet.add(lang));
    }
  }

  const output = {
    repo_name: repoDetails.name,
    repo_description: repoDetails.description || "",
    repo_url: repoDetails.html_url,
    tech_stack: [...languageSet].join(", "),
  };

  await fs.writeJson(path.join(process.cwd(), "repo-data.json"), output, { spaces: 2 });
  console.log("Fetched repo data:", output);

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    const lines = [
      `repo_name=${output.repo_name}`,
      `repo_description=${output.repo_description}`,
      `repo_url=${output.repo_url}`,
      `tech_stack=${output.tech_stack}`,
    ];
    await fs.appendFile(githubOutput, lines.join("\n") + "\n");
  }
}

main().catch((error) => {
  console.error("fetch-repo-data.js failed:", error);
  process.exit(1);
});
