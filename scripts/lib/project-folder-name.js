const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;

// The Drive folder name for a project: the bare repo name (e.g. "AegisZero"),
// not a lowercased slug — keeps folders human-readable and matching the repo
// exactly. Falls back to the resume project's display name for projects that
// aren't linked to a GitHub repo (repoFullName unset).
function projectFolderName(project) {
  const source = (project.repoFullName && project.repoFullName.split("/").pop()) || project.name || "project";
  const cleaned = String(source).trim().replace(CONTROL_CHARS, "");
  return cleaned || "project";
}

module.exports = { projectFolderName };
