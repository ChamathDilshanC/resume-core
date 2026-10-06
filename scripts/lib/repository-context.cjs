// Kept byte-for-byte identical in resume-admin/lib: both repositories deploy independently.
// Read-only GitHub API collection. No README links, scripts or HTML are executed.
const DEFAULT_LIMITS = Object.freeze({
  maxRepositories: 24, maxDepth: 6, maxReadmesPerRepository: 8,
  maxCharsPerReadme: 32000, maxTotalChars: 160000,
  maxRequests: 180, requestTimeoutMs: 8000, totalTimeoutMs: 45000,
});
const validOwner = (s) => typeof s === "string" && /^[A-Za-z0-9-]+$/.test(s);
const validRepo = (s) => typeof s === "string" && /^[A-Za-z0-9_.-]+$/.test(s) && !/^\.+$/.test(s);
const encodePath = (s) => s.split("/").map(encodeURIComponent).join("/");

function resolveSubmoduleUrl(raw, parentOwner, parentRepo) {
  try {
    let value = raw.trim();
    if (/^git@github\.com:/i.test(value)) value = value.replace(/^git@github\.com:/i, "https://github.com/");
    const url = new URL(value, value.startsWith("./") || value.startsWith("../")
      ? `https://github.com/${parentOwner}/${parentRepo}/` : undefined);
    if (url.hostname.toLowerCase() !== "github.com" || url.port || url.search || url.hash || url.password) return null;
    if (!["https:", "ssh:", "git:"].includes(url.protocol)) return null;
    if (url.username && !(url.protocol === "ssh:" && url.username === "git")) return null;
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length !== 2) return null;
    const [owner, repo] = [parts[0], parts[1].replace(/\.git$/i, "")];
    return validOwner(owner) && validRepo(repo) ? { owner, repo } : null;
  } catch { return null; }
}

function parseGitmodules(text) {
  const modules = [];
  let current;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) {
      current = /^\s*\[submodule\s+"/i.test(line) ? {} : null;
      if (current) modules.push(current);
      continue;
    }
    if (!current) continue;
    const match = line.match(/^\s*(path|url)\s*=\s*("(?:\\.|[^"\\])*"|[^#;]*)(?:\s*[#;].*)?$/i);
    if (match) current[match[1].toLowerCase()] = match[2].trim().replace(/^"|"$/g, "").replace(/\\(["\\])/g, "$1");
  }
  return modules.filter((m) => m.path && m.url);
}

function cleanReadme(text) {
  return text.replace(/<!--[^]*?-->/g, "")
    .replace(/<(script|style|svg)\b[^>]*>[^]*?<\/\1>/gi, "")
    .replace(/!\[[^\]]*\]\([^\n)]*\)/g, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<\/?(?:p|div|br|h[1-6]|li|tr|details|summary)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:nbsp|amp|lt|gt|quot);/g, (s) => ({ "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"' })[s])
    .replace(/\r\n/g, "\n").replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n").trim();
}

function researchSummary(context) {
  return {
    fetchedAt: new Date().toISOString(),
    sources: context.documents.map(({ text, ...source }) => source),
    warnings: context.warnings,
  };
}

async function collectRepositoryContext({ owner, repo, token, fetchImpl = fetch, limits: overrides = {}, requireReady = false }) {
  if (!validOwner(owner) || !validRepo(repo)) throw new Error("Expected a valid GitHub owner and repository name.");
  const limits = { ...DEFAULT_LIMITS };
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in limits) || !Number.isInteger(value) || value < 1 || value > limits[key]) throw new Error(`Invalid repository collection limit: ${key}`);
    limits[key] = value;
  }
  const deadline = Date.now() + limits.totalTimeoutMs;
  const warnings = new Set();
  const documents = [];
  const repositories = [];
  let requests = 0;
  let characters = 0;
  let halted = "";
  const warn = (message) => warnings.add(message);

  async function request(repository, endpoint, ref, optional = false) {
    if (halted || Date.now() >= deadline || requests >= limits.maxRequests) {
      halted ||= "README collection stopped at its time/request limit; some sources were not read.";
      warn(halted);
      return null;
    }
    requests++;
    const query = new URLSearchParams();
    if (ref) query.set("ref", ref);
    if (endpoint.startsWith("git/trees/")) query.set("recursive", "1");
    const url = `https://api.github.com/repos/${encodePath(repository)}${endpoint ? `/${endpoint}` : ""}${query.size ? `?${query}` : ""}`;
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      const response = await fetchImpl(url, {
        headers, redirect: "error", cache: "no-store",
        signal: AbortSignal.timeout(Math.max(1, Math.min(limits.requestTimeoutMs, deadline - Date.now()))),
      });
      if (response.status === 404 && optional) return null;
      if (!response.ok) {
        if (response.status === 401 || response.status === 429 ||
            (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")))) {
          halted = `GitHub access/rate limit (HTTP ${response.status}); remaining sources were not read.`;
          warn(halted);
        }
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      // Do not expose response bodies or tokens in logs/UI.
      warn(`Could not read ${repository}/${endpoint}: ${/^HTTP \d+$/.test(error.message) ? error.message : "request failed or timed out"}.`);
      return null;
    }
  }

  function decode(file, label) {
    if (!file || file.encoding !== "base64" || typeof file.content !== "string") {
      if (file) warn(`${label} was unavailable as text (possibly over GitHub's file-size limit).`);
      return null;
    }
    return Buffer.from(file.content, "base64").toString("utf8");
  }

  const fullName = `${owner}/${repo}`;
  const details = await request(fullName, "", "");
  if (!details) throw new Error(`Could not access GitHub repository ${fullName}. Check repository access and retry.`);
  const root = { fullName: details.full_name || fullName, name: details.name || repo,
    description: details.description || "", url: details.html_url || `https://github.com/${fullName}`, topics: details.topics || [] };
  const result = () => ({ root, documents, repositories, warnings: [...warnings] });
  if (requireReady && !root.topics.includes("resume-ready")) return result();
  const rootRef = await request(fullName, `git/ref/heads/${encodeURIComponent(details.default_branch || "main")}`, "");
  if (!rootRef?.object?.sha) throw new Error(`Could not resolve the current commit of ${fullName}. Retry after checking GitHub access.`);
  const queue = [{ owner, repo, ref: rootRef.object.sha, depth: 0 }];
  const visited = new Set();
  const skipPath = /(^|\/)(node_modules|vendor|\.git|dist|build|coverage|\.next|target)(\/|$)/i;
  const isReadme = (p) => /(^|\/)readme(?:(?:\.[a-z0-9_-]+)*\.(?:md|markdown|rst|txt|adoc|asciidoc|rdoc|textile|org|html?))?$/i.test(p);

  while (queue.length && !halted) {
    const node = queue.shift();
    const repository = `${node.owner}/${node.repo}`;
    const key = `${repository.toLowerCase()}@${node.ref}`;
    if (visited.has(key)) continue;
    if (visited.size >= limits.maxRepositories) {
      warn(`Stopped at ${limits.maxRepositories} repositories; remaining submodules were not read.`);
      break;
    }
    visited.add(key);
    // Independent reads are parallel; the traversal and budget accounting remain deterministic.
    const [primary, modulesFile, tree, languages] = await Promise.all([
      request(repository, "readme", node.ref, true),
      request(repository, "contents/.gitmodules", node.ref, true),
      request(repository, `git/trees/${encodeURIComponent(node.ref)}`, ""),
      request(repository, "languages", ""),
    ]);
    repositories.push({ repository, ref: node.ref, depth: node.depth, languages: Object.keys(languages || {}) });
    if (tree?.truncated) warn(`${repository}: GitHub returned an incomplete file tree; some READMEs or submodules may be missing.`);
    const entries = Array.isArray(tree?.tree) ? tree.tree : [];
    const paths = [...new Set([
      ...(primary?.path ? [primary.path] : []),
      ...entries.filter((e) => e.type === "blob" && isReadme(e.path) && !skipPath.test(e.path))
        .map((e) => e.path).sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b)),
    ])];
    if (!paths.length) warn(`${repository}: no accessible README found at ${node.ref.slice(0, 12)}.`);
    if (paths.length > limits.maxReadmesPerRepository) warn(`${repository}: only ${limits.maxReadmesPerRepository} of ${paths.length} READMEs fit the per-repository limit.`);
    for (const filePath of paths.slice(0, limits.maxReadmesPerRepository)) {
      if (characters >= limits.maxTotalChars) {
        warn("README text budget reached; additional README contents were omitted.");
        break;
      }
      const file = primary?.path === filePath ? primary : await request(repository, `contents/${encodePath(filePath)}`, node.ref);
      const decoded = decode(file, `${repository}/${filePath}`);
      if (decoded === null) continue;
      const cleaned = cleanReadme(decoded);
      if (!cleaned) { warn(`${repository}/${filePath}: no readable text.`); continue; }
      const allowance = Math.min(limits.maxCharsPerReadme, limits.maxTotalChars - characters);
      const truncated = cleaned.length > allowance;
      // Include the end as well: limitations and roadmap caveats often appear there.
      const marker = "\n[README excerpt: middle omitted]\n";
      const take = Math.max(0, allowance - marker.length);
      const text = !truncated ? cleaned : allowance <= marker.length ? cleaned.slice(0, allowance)
        : cleaned.slice(0, Math.ceil(take * .75)) + marker + (Math.floor(take * .25) ? cleaned.slice(-Math.floor(take * .25)) : "");
      characters += text.length;
      if (truncated) warn(`${repository}/${filePath}: text was shortened to fit the AI context budget.`);
      documents.push({ repository, path: filePath, ref: node.ref, depth: node.depth,
        url: `https://github.com/${repository}/blob/${encodeURIComponent(node.ref)}/${encodePath(filePath)}`, text, truncated });
    }
    const modulesText = decode(modulesFile, `${repository}/.gitmodules`);
    for (const sub of parseGitmodules(modulesText || "")) {
      if (node.depth >= limits.maxDepth) { warn(`${repository}: nested submodules beyond depth ${limits.maxDepth} were not read.`); break; }
      const resolved = resolveSubmoduleUrl(sub.url, node.owner, node.repo);
      if (!resolved) { warn(`${repository}/${sub.path}: unsupported submodule URL; only GitHub repositories are read.`); continue; }
      const gitlink = entries.find((e) => e.path === sub.path && e.type === "commit");
      if (!gitlink?.sha) { warn(`${repository}/${sub.path}: pinned submodule commit unavailable; README was not read.`); continue; }
      queue.push({ ...resolved, ref: gitlink.sha, depth: node.depth + 1 });
    }
  }
  return result();
}

module.exports = { collectRepositoryContext, resolveSubmoduleUrl, parseGitmodules, cleanReadme, researchSummary, DEFAULT_LIMITS };
