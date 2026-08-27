// Pure reconciliation: given what's currently in resume.json for a project
// and what Drive just reported per subfolder, produce the next `mockups`
// array. Kept free of any Drive/network calls so it's unit-testable.
//
// - New files become new mockup records (enabled by default).
// - Files seen before keep their user-editable fields (enabled/featured/
//   displayOrder/caption) instead of resetting them every sync.
// - Files that disappeared from Drive are kept (so a re-added file resumes
//   its old featured/order/caption state) but flagged `missing: true` and
//   force-disabled, so a deleted file can never keep showing on the live
//   portfolio.
// - The same Drive file id turning up twice (e.g. shared into two
//   subfolders) only produces one record — first occurrence wins.
function reconcileMockups(existingMockups, filesByCategory) {
  const existingById = new Map((existingMockups || []).map((m) => [m.googleDriveFileId, m]));
  const seenIds = new Set();
  const nowIso = new Date().toISOString();
  const next = [];

  for (const category of Object.keys(filesByCategory)) {
    for (const file of filesByCategory[category] || []) {
      if (seenIds.has(file.id)) continue;
      seenIds.add(file.id);

      const existing = existingById.get(file.id);
      next.push({
        id: file.id,
        googleDriveFileId: file.id,
        fileName: file.name,
        mimeType: file.mimeType,
        webViewLink: file.webViewLink || "",
        thumbnailLink: file.thumbnailLink || "",
        category,
        enabled: existing ? existing.enabled : true,
        featured: existing ? existing.featured : false,
        displayOrder: existing ? existing.displayOrder : Number.MAX_SAFE_INTEGER,
        caption: existing ? existing.caption || "" : "",
        missing: false,
        lastSyncedAt: nowIso,
      });
    }
  }

  for (const existing of existingMockups || []) {
    if (!seenIds.has(existing.googleDriveFileId)) {
      next.push({ ...existing, missing: true, enabled: false });
    }
  }

  next.sort((a, b) => a.displayOrder - b.displayOrder);
  next.forEach((m, i) => {
    m.displayOrder = i;
  });

  return next;
}

module.exports = { reconcileMockups };
