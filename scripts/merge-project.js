const fs = require("fs-extra");
const path = require("path");

async function main() {
  const repoName = process.env.REPO_NAME;
  if (!repoName) {
    throw new Error("REPO_NAME is required.");
  }

  const resumeJsonPath = process.env.RESUME_JSON_PATH || path.join(process.cwd(), "data", "resume.json");
  const bulletsPath = path.join(process.cwd(), process.env.BULLETS_FILE || "bullets.json");

  const resume = await fs.readJson(resumeJsonPath);
  const draft = await fs.readJson(bulletsPath);
  // Accept older bullet-array files while the pipeline transitions to drafts.
  const highlights = Array.isArray(draft) ? draft : draft.highlights;
  if (!Array.isArray(highlights) || !highlights.length || !highlights.every((h) => typeof h === "string" && h.trim())) {
    throw new Error("Invalid project highlights; resume.json was not changed.");
  }
  if (!Array.isArray(draft) && (typeof draft.description !== "string" || !draft.description.trim())) {
    throw new Error("Invalid project description; resume.json was not changed.");
  }

  const repoUrl = process.env.REPO_URL || "";
  const projectEntry = {
    name: repoName,
    description: Array.isArray(draft) ? process.env.REPO_DESCRIPTION || "" : draft.description,
    highlights,
    links: repoUrl ? [{ label: repoName, url: repoUrl }] : [],
  };

  resume.projects = resume.projects || [];
  const repoFullName = [process.env.SOURCE_REPO_OWNER, process.env.SOURCE_REPO_NAME].filter(Boolean).join("/");
  if (repoFullName.includes("/")) projectEntry.repoFullName = repoFullName;
  const existingIndex = resume.projects.findIndex((project) =>
    (repoFullName && project.repoFullName === repoFullName) || project.name === repoName);

  if (existingIndex >= 0) {
    resume.projects[existingIndex] = { ...resume.projects[existingIndex], ...projectEntry };
    console.log(`Updated existing project entry for "${repoName}".`);
  } else {
    resume.projects.unshift(projectEntry);
    console.log(`Added new project entry for "${repoName}".`);
  }

  await fs.writeJson(resumeJsonPath, resume, { spaces: 2 });
}

main().catch((error) => {
  console.error("merge-project.js failed:", error);
  process.exit(1);
});
