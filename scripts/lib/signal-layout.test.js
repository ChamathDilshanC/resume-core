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
  assert.match(html, /basics\.hideDeclaration/);
  assert.match(html, /basics\.targetCompany/);
  assert.doesNotMatch(html, /<table\b|position\s*:\s*absolute|<textarea\b/i);
});

test("Signal ATS CSS avoids flex, grid, tables, and text-box positioning", () => {
  const css = fs.readFileSync(path.join(templateDir, "styles.css"), "utf8");
  assert.doesNotMatch(css, /\b(grid-template|display\s*:\s*(grid|flex)|position\s*:\s*absolute)\b/i);
  assert.doesNotMatch(css, /(^|[,{]\s*)table\b/i);
});

test("Signal profile photo is contained at the top of the header", () => {
  const html = fs.readFileSync(path.join(templateDir, "template.html"), "utf8");
  const css = fs.readFileSync(path.join(templateDir, "styles.css"), "utf8");
  const header = html.slice(html.indexOf('<header class="header">'), html.indexOf("</header>"));
  assert.ok(header.indexOf('class="profile-photo"') < header.indexOf('class="header-main"'));
  assert.match(css, /\.header\s*\{[^}]*display:\s*flow-root;/s);
});

test("Signal contact details stay in two compact rows", () => {
  const html = fs.readFileSync(path.join(templateDir, "template.html"), "utf8");
  assert.match(html, /mailto:/);
  assert.match(html, /\|\s*<a href="tel:/);
  assert.match(html, /\|\s*<a href="/);
  const contactRows = html.match(/<p class="contact">[\s\S]*?<\/p>/g) || [];
  assert.equal(contactRows.length, 2);
  assert.doesNotMatch(contactRows[0], /<br\s*\/?\s*>/i);
  assert.doesNotMatch(contactRows[1], /<br\s*\/?\s*>/i);
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
