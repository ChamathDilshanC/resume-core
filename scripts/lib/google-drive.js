const { google } = require("googleapis");

function getDriveClient() {
  const credentialsJson = process.env.GDRIVE_CREDENTIALS;
  if (!credentialsJson) throw new Error("GDRIVE_CREDENTIALS is required.");

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credentialsJson),
    // Same broad scope upload-to-drive.js uses — drive.file only sees files
    // the service account itself created, so ordinary "Share with" grants
    // (on the root projects folder) wouldn't be visible under that scope.
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return google.drive({ version: "v3", auth });
}

function escapeDriveQueryValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolder(drive, name, parentId) {
  const q = `name = '${escapeDriveQueryValue(name)}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive.files.list({ q, fields: "files(id, name, webViewLink)", spaces: "drive" });
  return (res.data.files && res.data.files[0]) || null;
}

async function createFolder(drive, name, parentId) {
  const res = await drive.files.create({
    resource: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id, name, webViewLink",
  });
  return res.data;
}

// Idempotent: a second call with the same name/parent reuses the first
// call's folder instead of creating a sibling duplicate.
async function findOrCreateFolder(drive, name, parentId) {
  const existing = await findFolder(drive, name, parentId);
  if (existing) return existing;
  return createFolder(drive, name, parentId);
}

const SUBFOLDER_NAMES = ["mockups", "screenshots", "assets"];

// Reuses `existingFolderId` (from a previous sync) when it still resolves,
// so a repo rename doesn't orphan the old folder and create a new one under
// the new name. Falls back to a by-name find-or-create otherwise — covers
// both "never synced before" and "the stored folder was deleted out-of-band".
async function ensureProjectFolderStructure(drive, rootFolderId, folderName, existingFolderId) {
  let projectFolder = null;

  if (existingFolderId) {
    try {
      const res = await drive.files.get({ fileId: existingFolderId, fields: "id, name, webViewLink, trashed" });
      if (!res.data.trashed) projectFolder = res.data;
    } catch {
      // No longer resolves (deleted / access revoked) — fall through to by-name lookup.
    }
  }

  if (!projectFolder) {
    projectFolder = await findOrCreateFolder(drive, folderName, rootFolderId);
  }

  const subfolders = {};
  for (const sub of SUBFOLDER_NAMES) {
    subfolders[sub] = await findOrCreateFolder(drive, sub, projectFolder.id);
  }

  return {
    folderId: projectFolder.id,
    webViewLink: projectFolder.webViewLink || `https://drive.google.com/drive/folders/${projectFolder.id}`,
    mockupsFolderId: subfolders.mockups.id,
    screenshotsFolderId: subfolders.screenshots.id,
    assetsFolderId: subfolders.assets.id,
  };
}

const SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Pulled out as its own pure function so the filtering rule (which MIME
// types count as a "mockup") is unit-testable without a live Drive client.
function filterSupportedFiles(files) {
  return (files || []).filter((f) => SUPPORTED_MIME_TYPES.has(f.mimeType));
}

async function listSupportedFiles(drive, folderId) {
  if (!folderId) return [];
  const files = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, webViewLink, thumbnailLink, modifiedTime)",
      spaces: "drive",
      pageToken,
    });
    files.push(...filterSupportedFiles(res.data.files));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return files;
}

module.exports = {
  getDriveClient,
  findOrCreateFolder,
  ensureProjectFolderStructure,
  listSupportedFiles,
  filterSupportedFiles,
  SUBFOLDER_NAMES,
  SUPPORTED_MIME_TYPES,
};
