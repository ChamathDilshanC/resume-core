const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const templateNames = ["apex-ats", "clarity-ats", "default", "iconic", "signal-ats", "ultra"];

test("every resume template honors the optional closing declaration", () => {
  for (const name of templateNames) {
    const template = fs.readFileSync(path.join(root, "templates", name, "template.html"), "utf8");
    assert.match(template, /basics\.hideDeclaration/);
    assert.match(template, /basics\.targetCompany/);
    assert.match(template, /class="[^"]*\bdeclaration\b[^"]*"/);
  }
});
