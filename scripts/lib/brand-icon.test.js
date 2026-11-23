const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const templateNames = ["apex-ats", "clarity-ats", "default", "iconic", "signal-ats", "ultra"];

test("every resume template supports the optional brand icon", () => {
  for (const name of templateNames) {
    const template = fs.readFileSync(path.join(root, "templates", name, "template.html"), "utf8");
    const styles = fs.readFileSync(path.join(root, "templates", name, "styles.css"), "utf8");
    assert.match(template, /basics\.includeBrandIcon/);
    assert.match(template, /class="brand-icon"/);
    assert.match(styles, /\.brand-icon\s*\{/);
  }
});

test("the brand icon asset and conditional PDF injection are present", () => {
  const assetPath = path.join(root, "assets", "brand-icon-black.png");
  const generator = fs.readFileSync(path.join(root, "generate-pdf.js"), "utf8");
  assert.ok(fs.statSync(assetPath).size > 0);
  assert.match(generator, /BRAND_ICON_ASSET_PATH\s*=\s*["']assets\/brand-icon-black\.png["']/);
  assert.match(generator, /resumeData\.basics\?\.includeBrandIcon/);
  assert.match(generator, /resumeData\.basics\.brandIcon/);
});
