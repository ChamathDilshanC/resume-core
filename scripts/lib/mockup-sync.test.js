const test = require("node:test");
const assert = require("node:assert/strict");
const { reconcileMockups } = require("./mockup-sync");

function file(id, name, overrides = {}) {
  return { id, name, mimeType: "image/png", webViewLink: `https://drive/${id}`, thumbnailLink: `https://thumb/${id}`, ...overrides };
}

test("new files become new enabled mockups", () => {
  const result = reconcileMockups([], { mockups: [file("f1", "dashboard.png")] });
  assert.equal(result.length, 1);
  assert.equal(result[0].googleDriveFileId, "f1");
  assert.equal(result[0].category, "mockups");
  assert.equal(result[0].enabled, true);
  assert.equal(result[0].featured, false);
  assert.equal(result[0].missing, false);
});

test("re-syncing keeps user-edited fields on an already-known file", () => {
  const existing = [
    { id: "f1", googleDriveFileId: "f1", fileName: "old-name.png", enabled: false, featured: true, displayOrder: 3, caption: "hero shot" },
  ];
  const result = reconcileMockups(existing, { mockups: [file("f1", "dashboard.png")] });
  assert.equal(result[0].enabled, false);
  assert.equal(result[0].featured, true);
  assert.equal(result[0].caption, "hero shot");
  // fileName still refreshes from Drive (it may have been renamed there)
  assert.equal(result[0].fileName, "dashboard.png");
});

test("a file removed from Drive is kept but flagged missing and force-disabled", () => {
  const existing = [
    { id: "gone", googleDriveFileId: "gone", fileName: "old.png", enabled: true, featured: true, displayOrder: 0, caption: "" },
  ];
  const result = reconcileMockups(existing, { mockups: [] });
  assert.equal(result.length, 1);
  assert.equal(result[0].missing, true);
  assert.equal(result[0].enabled, false);
  // featured/caption state is preserved in case the file comes back
  assert.equal(result[0].featured, true);
});

test("the same Drive file id appearing in two categories only produces one record", () => {
  const result = reconcileMockups([], {
    mockups: [file("dup", "shared.png")],
    screenshots: [file("dup", "shared.png")],
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].category, "mockups");
});

test("displayOrder is renumbered densely after reconciliation", () => {
  const existing = [
    { id: "a", googleDriveFileId: "a", displayOrder: 10, enabled: true, featured: false, caption: "" },
    { id: "b", googleDriveFileId: "b", displayOrder: 5, enabled: true, featured: false, caption: "" },
  ];
  const result = reconcileMockups(existing, { mockups: [file("a", "a.png"), file("b", "b.png")] });
  const order = result.map((m) => [m.id, m.displayOrder]);
  assert.deepEqual(order, [["b", 0], ["a", 1]]);
});
