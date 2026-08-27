const fs = require("fs-extra");
const path = require("path");
const { getDriveClient, ensureProjectFolderStructure, listSupportedFiles } = require("./lib/google-drive");
const { projectFolderName } = require("./lib/project-folder-name");
const { reconcileMockups } = require("./lib/mockup-sync");

async function verifyRootFolder(drive, rootFolderId) {
  try {
    const res = await drive.files.get({ fileId: rootFolderId, fields: "id, name, trashed" });
    if (res.data.trashed) {
      throw new Error(`GOOGLE_DRIVE_PROJECTS_ROOT_FOLDER_ID (${rootFolderId}) points to a trashed folder.`);
    }
  } catch (error) {
    // googleapis (GaxiosError) surfaces the HTTP status as `.code` and/or
    // `.status` depending on version — check both rather than relying on
    // message text, which we already threw ourselves above for "trashed".
    if (error.code === 404 || error.status === 404 || /not found/i.test(error.message || "")) {
      throw new Error(
        `GOOGLE_DRIVE_PROJECTS_ROOT_FOLDER_ID (${rootFolderId}) was not found, or the service account ` +
          `doesn't have access to it. Share the root folder with the service account's email as Editor.`
      );
    }
    throw error;
  }
}

async function syncProject(drive, rootFolderId, project) {
  const folderName = projectFolderName(project);
  const now = new Date().toISOString();

  const folder = await ensureProjectFolderStructure(
    drive,
    rootFolderId,
    folderName,
    project.driveFolder && project.driveFolder.folderId
  );

  project.driveFolder = {
    ...folder,
    createdAt: (project.driveFolder && project.driveFolder.createdAt) || now,
    lastSyncedAt: now,
  };

  const [mockups, screenshots, assets] = await Promise.all([
    listSupportedFiles(drive, folder.mockupsFolderId),
    listSupportedFiles(drive, folder.screenshotsFolderId),
    listSupportedFiles(drive, folder.assetsFolderId),
  ]);

  project.mockups = reconcileMockups(project.mockups, { mockups, screenshots, assets });

  return project.mockups.length;
}

async function main() {
  const rootFolderId = process.env.GOOGLE_DRIVE_PROJECTS_ROOT_FOLDER_ID;
  const resumeJsonPath = process.env.RESUME_JSON_PATH || path.join(process.cwd(), "data", "resume.json");
  const targetRepoFullName = (process.env.TARGET_REPO_FULL_NAME || "").trim();
  const summaryPath = path.join(process.cwd(), "drive-sync-summary.json");

  if (!rootFolderId) throw new Error("GOOGLE_DRIVE_PROJECTS_ROOT_FOLDER_ID is required.");

  const resume = await fs.readJson(resumeJsonPath);
  resume.projects = resume.projects || [];

  // Submodules never get their own Drive folder — they belong to whichever
  // main project already represents the meta-repo they live under.
  const eligible = resume.projects.filter((project) => project.repositoryType !== "SUBMODULE");
  const targets = targetRepoFullName
    ? eligible.filter((project) => project.repoFullName === targetRepoFullName)
    : eligible;

  const summary = { rootFolderId, targetRepoFullName: targetRepoFullName || null, synced: [] };

  if (targets.length === 0) {
    console.log(
      targetRepoFullName
        ? `No project with repoFullName "${targetRepoFullName}" found in resume.json — nothing to sync.`
        : "No eligible projects to sync."
    );
    await fs.writeJson(summaryPath, summary, { spaces: 2 });
    return;
  }

  const drive = getDriveClient();
  await verifyRootFolder(drive, rootFolderId);

  for (const project of targets) {
    if (!project.repoFullName) {
      console.warn(`Skipping "${project.name}" — no repoFullName set, can't build a stable Drive folder link.`);
      summary.synced.push({ name: project.name, repoFullName: null, ok: false, error: "missing repoFullName" });
      continue;
    }

    try {
      const mockupCount = await syncProject(drive, rootFolderId, project);
      console.log(`Synced "${project.name}" (${project.repoFullName}) — ${mockupCount} mockup file(s).`);
      summary.synced.push({ name: project.name, repoFullName: project.repoFullName, ok: true, mockupCount });
    } catch (error) {
      console.error(`Failed to sync "${project.name}" (${project.repoFullName}): ${error.message}`);
      summary.synced.push({ name: project.name, repoFullName: project.repoFullName, ok: false, error: error.message });
    }
  }

  await fs.writeJson(resumeJsonPath, resume, { spaces: 2 });
  await fs.writeJson(summaryPath, summary, { spaces: 2 });

  if (summary.synced.some((s) => !s.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("sync-drive-folders.js failed:", error);
  process.exit(1);
});
