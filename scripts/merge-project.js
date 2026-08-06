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
  const highlights = await fs.readJson(bulletsPath);

  const repoUrl = process.env.REPO_URL || "";
  const projectEntry = {
    name: repoName,
    description: process.env.REPO_DESCRIPTION || "",
    highlights,
    links: repoUrl ? [{ label: repoName, url: repoUrl }] : [],
  };

  resume.projects = resume.projects || [];
  const existingIndex = resume.projects.findIndex((project) => project.name === repoName);

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
