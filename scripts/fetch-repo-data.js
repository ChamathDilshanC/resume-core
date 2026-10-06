const fs = require("fs-extra");
const path = require("path");
const { randomUUID } = require("node:crypto");
const { collectRepositoryContext } = require("./lib/repository-context.cjs");

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.SOURCE_REPO_OWNER;
  const repo = process.env.SOURCE_REPO_NAME;
  if (!token || !owner || !repo) {
    throw new Error("GITHUB_TOKEN, SOURCE_REPO_OWNER, and SOURCE_REPO_NAME are required.");
  }
  const context = await collectRepositoryContext({ owner, repo, token, requireReady: true });
  const output = {
    repo_name: context.root.name,
    repo_description: context.root.description,
    repo_url: context.root.url,
    tech_stack: [...new Set(context.repositories.flatMap((r) => r.languages))].join(", "),
    is_ready: context.root.topics.includes("resume-ready"),
    repository_context: context,
  };
  // README text stays in this local handoff file, never in GitHub output variables or logs.
  await fs.writeJson(path.resolve(process.cwd(), process.env.REPO_DATA_FILE || "repo-data.json"), output, { spaces: 2 });
  console.log(`Collected ${context.documents.length} READMEs from ${context.repositories.length} repositories.`);
  for (const warning of context.warnings) console.warn(warning);
  if (!output.is_ready) console.log('Project is not tagged "resume-ready"; skipping README collection and resume update.');
  if (process.env.GITHUB_OUTPUT) {
    const lines = [];
    for (const key of ["repo_name", "repo_description", "repo_url", "tech_stack", "is_ready"]) {
      const delimiter = `resume_${randomUUID()}`;
      lines.push(`${key}<<${delimiter}\n${output[key]}\n${delimiter}`);
    }
    await fs.appendFile(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
  }
}

main().catch((error) => {
  console.error("fetch-repo-data.js failed:", error);
  process.exit(1);
});
