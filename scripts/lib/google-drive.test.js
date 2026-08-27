const test = require("node:test");
const assert = require("node:assert/strict");
const { filterSupportedFiles, SUPPORTED_MIME_TYPES } = require("./google-drive");

test("keeps png, jpeg, and webp", () => {
  const files = [
    { id: "1", mimeType: "image/png" },
    { id: "2", mimeType: "image/jpeg" },
    { id: "3", mimeType: "image/webp" },
  ];
  const result = filterSupportedFiles(files);
  assert.equal(result.length, 3);
});

test("drops unsupported mime types (gif, pdf, folders)", () => {
  const files = [
    { id: "1", mimeType: "image/gif" },
    { id: "2", mimeType: "application/pdf" },
    { id: "3", mimeType: "application/vnd.google-apps.folder" },
  ];
  const result = filterSupportedFiles(files);
  assert.equal(result.length, 0);
});

test("handles an empty/undefined file list", () => {
  assert.deepEqual(filterSupportedFiles(undefined), []);
  assert.deepEqual(filterSupportedFiles([]), []);
});

test("SUPPORTED_MIME_TYPES documents the exact set (gif deliberately excluded for now)", () => {
  assert.equal(SUPPORTED_MIME_TYPES.has("image/gif"), false);
  assert.equal(SUPPORTED_MIME_TYPES.size, 3);
});
