const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const templateDir = path.join(__dirname, "..", "..", "templates", "signal-ats");

test("Signal ATS template uses conventional sections and plain-text contact structure", () => {
  const html = fs.readFileSync(path.join(templateDir, "template.html"), "utf8");
  assert.match(html, /<h2>Technical Skills<\/h2>/);
  assert.match(html, /<h2>Work Experience<\/h2>/);
  assert.match(html, /<h2>Projects<\/h2>/);
  assert.match(html, /mailto:/);
  assert.doesNotMatch(html, /<table\b|position\s*:\s*absolute|<textarea\b/i);
});

test("Signal ATS CSS avoids flex, grid, tables, and text-box positioning", () => {
  const css = fs.readFileSync(path.join(templateDir, "styles.css"), "utf8");
  assert.doesNotMatch(css, /\b(grid-template|display\s*:\s*(grid|flex)|position\s*:\s*absolute)\b/i);
  assert.doesNotMatch(css, /(^|[,{]\s*)table\b/i);
});

test("Signal contact and project entries use line breaks instead of separator spans", () => {
  const html = fs.readFileSync(path.join(templateDir, "template.html"), "utf8");
  assert.match(html, /mailto:/);
  assert.match(html, /<br \/><a href="tel:/);
  assert.doesNotMatch(html, /\s\|\s<a href="/);
  const projectSection = html.slice(html.indexOf('<h2>Projects</h2>'), html.indexOf("<h2>Education</h2>"));
  assert.doesNotMatch(projectSection, /<div class="entry-title">/);
});

test("PDF exporter defines a default compact project limit and searchable-text checks", () => {
  const generator = fs.readFileSync(path.join(templateDir, "..", "..", "generate-pdf.js"), "utf8");
  assert.match(generator, /projectLimit\s*[^;]*3|resumeFormat\.projectLimit/);
  assert.match(generator, /pdf-parse/);
  assert.match(generator, /no searchable text|searchable PDF text|text extraction/);
  assert.match(generator, /maximum is 2/);
});
