const test = require("node:test");
const assert = require("node:assert/strict");
const { projectFolderName } = require("./project-folder-name");

test("uses the repo name from repoFullName, not the display name", () => {
  const name = projectFolderName({ repoFullName: "ChamathDilshanC/AegisZero", name: "Aegis Zero Security Suite" });
  assert.equal(name, "AegisZero");
});

test("preserves hyphens and casing in the repo name", () => {
  const name = projectFolderName({ repoFullName: "ChamathDilshanC/DevResume-Automation-Pipeline" });
  assert.equal(name, "DevResume-Automation-Pipeline");
});

test("falls back to the display name when there's no linked repo", () => {
  const name = projectFolderName({ name: "Freelance Landing Page" });
  assert.equal(name, "Freelance Landing Page");
});

test("falls back to a generic name when both are empty", () => {
  const name = projectFolderName({ name: "" });
  assert.equal(name, "project");
});

test("strips control characters", () => {
  const withControlChars = "Weird" + String.fromCharCode(7) + "Na" + String.fromCharCode(31) + "me";
  const name = projectFolderName({ name: withControlChars });
  assert.equal(name, "WeirdName");
});
