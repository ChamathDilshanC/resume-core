// Local-only integration QA. No GitHub writes, delivery jobs, or data edits.
// RESUME_JSON_PATH may point at private real data; outputs stay in OS temp.
const assert = require("node:assert/strict");
const fs = require("fs-extra");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");
const puppeteer = require("puppeteer");

const root = path.resolve(__dirname, "..");
const admin = path.resolve(root, "../resume-admin");
const adminRequire = createRequire(path.join(admin, "package.json"));
const ts = adminRequire("typescript");

function loadAdmin(relative, mocks = {}) {
  const filename = path.join(admin, relative);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020,
      esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, process, Buffer, console,
    require: (id) => Object.hasOwn(mocks, id) ? mocks[id] : adminRequire(id),
  }, { filename });
  return exports;
}

async function main() {
  execFileSync(process.execPath, [path.join(admin, "scripts/verify-ai.cjs")], { stdio: "inherit" });
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "clarity-qa-"));
  console.log(`QA output: ${output}`);
  fs.copySync(path.join(root, "generate-pdf.js"), path.join(output, "generate-pdf.js"));
  fs.copySync(path.join(root, "templates"), path.join(output, "templates"));
  fs.copySync(path.join(root, "assets"), path.join(output, "assets"));
  const data = process.env.RESUME_JSON_PATH
    ? fs.readJsonSync(path.resolve(process.env.RESUME_JSON_PATH))
    : { basics: { name: "Alex Morgan", label: "Software Engineer", hideDeclaration: true,
      email: "alex@example.com", profiles: [], summary: "Builds reliable software." },
      skills: [{ name: "Languages", keywords: ["TypeScript", "Python"] }],
      work: [{ position: "Software Engineer", name: "Example", startDate: "2025-01",
        endDate: "Present", highlights: ["Reduced deployment time by 40%."] }],
      projects: [{ name: "Platform", description: "Distributed services",
        links: [{ label: "Repository", url: "https://example.com/platform" }],
        highlights: ["Delivered resilient services."] }] };

  // Exercise the actual GitHub discovery/fetch functions with a local content
  // transport. Authentication and deployment remain live-environment checks.
  class Octokit {
    repos = { getContent: async ({ path: relative }) => {
      const file = path.join(root, relative);
      if (fs.statSync(file).isDirectory()) return { data: fs.readdirSync(file)
        .filter((name) => fs.statSync(path.join(file, name)).isDirectory())
        .map((name) => ({ name, type: "dir" })) };
      return { data: { type: "file", content: fs.readFileSync(file).toString("base64") } };
    } };
  }
  const github = loadAdmin("lib/github.ts", { "@octokit/rest": { Octokit } });
  const templates = await github.listTemplates("local-test");
  assert.equal(templates.find((t) => t.id === "clarity-ats").label, "Clarity (ATS)");
  const files = await github.fetchTemplateFiles("local-test", "clarity-ats");
  const { renderTemplatePreview } = loadAdmin("lib/preview.ts");
  const html = renderTemplatePreview(files.templateHtml, files.stylesCss, data);
  fs.writeFileSync(path.join(output, "preview.html"), html);

  // Render the existing Templates component with loaded state and invoke its
  // real button callback. This does not bypass or mutate production auth.
  const React = adminRequire("react");
  const states = [templates, { "clarity-ats": html }, "", false];
  let index = 0;
  const selected = [];
  const { TemplatesSection } = loadAdmin("app/dashboard/sections/TemplatesSection.tsx", {
    react: { ...React, useState: () => [states[index++], () => {}],
      useCallback: (fn) => fn, useEffect: () => {} },
    "@/components/FormControls": { Button: "button", SectionHeader: "header" },
    "@/components/icons": { TemplateIcon: "i", CheckCircleIcon: "i" },
    "../actions": {},
  });
  const tree = TemplatesSection({ activeTemplate: "default", data, onSelect: (id) => selected.push(id) });
  const elements = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    elements.push(node);
    visit(node.props?.children);
  }
  visit(tree);
  assert(elements.some((e) => e.type === "iframe" && e.props.title === "Clarity (ATS) preview" && e.props.srcDoc === html));
  elements.filter((e) => e.type === "button" && e.props.children === "Use this template")
    .forEach((e) => e.props.onClick());
  assert(selected.includes("clarity-ats"));
  fs.writeFileSync(path.join(output, "cards.html"), adminRequire("react-dom/server").renderToStaticMarkup(tree));

  const evidence = {
    basics: { name: "Evidence Candidate", label: "Software Engineer", jobDescription: "PRIVATE_JOB_NOTES",
      includeReferences: true },
    projects: [{ name: "Release Tool", description: "Package release automation.", role: "Backend contributor",
      startDate: "2025-01", endDate: "2025-04", technologies: ["Shell", "GitHub Actions"],
      evidence: { contribution: "PRIVATE_EVIDENCE_NOTES" },
      highlights: ["Wrote shell scripts to package releases."], links: [] }, { name: "HIDDEN_PROJECT_SENTINEL", includeInResume: false }],
    references: [{ name: "Reference Person", reference: "Contact on request" }],
  };
  const sparse = { basics: { name: "Sparse Candidate", hideDeclaration: true } };
  const stress = {
    basics: { name: "Alexandra " .repeat(12), label: "Senior Software Engineer " .repeat(8),
      hideDeclaration: true, image: "assets/does-not-exist.png", phone: "+94 123456789",
      profiles: [{ url: "https://example.com/" + "long-path".repeat(35) }] },
    skills: Array.from({ length: 30 }, (_, i) => ({ name: `Category ${i}`, keywords: ["TypeScript", "LongTechnology".repeat(12)] })),
    work: [{ position: "Principal Engineer", name: "Example", endDate: "Present",
      highlights: Array.from({ length: 32 }, (_, i) => `Achievement ${i}: ` + "Delivered reliable distributed systems. ".repeat(9)) }],
    projects: [{ name: "Long project", description: "A robust platform", links: [{ url: "https://example.com/" + "x".repeat(250) }], highlights: ["Shipped successfully."] }],
    education: [{ area: "Computer Science", institution: "Example University", endDate: "2025", score: "4.0", courses: ["Algorithms"] }],
    certificates: [{ name: "Cloud", issuer: "Example", date: "2025-01" }],
    references: [{ reference: "Available on request" }],
  };
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    for (const [name, input] of [["clarity-ats", data], ["sparse", sparse], ["stress", stress], ["evidence", evidence]]) {
      const page = await browser.newPage();
      await page.setViewport({ width: 794, height: 1123 });
      const requests = [];
      page.on("request", (request) => requests.push(request.url()));
      await page.setContent(renderTemplatePreview(files.templateHtml, files.stylesCss, input));
      assert.equal(requests.length, 0, "Clarity must not request remote assets");
      for (const width of [794, 375]) {
        await page.setViewport({ width, height: 1123 });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: horizontal overflow at ${width}`);
      }
      assert.equal(await page.$$eval("img, svg, canvas, table", (els) => els.length), 0);
      const visible = await page.$eval("body", (el) => el.innerText);
      assert(!visible.includes("PRIVATE_JOB_NOTES") && !visible.includes("PRIVATE_EVIDENCE_NOTES") && !visible.includes("HIDDEN_PROJECT_SENTINEL"));
      if (name === "evidence") {
        for (const text of ["Backend contributor", "Jan 2025 - Apr 2025", "Shell, GitHub Actions", "References"]) assert(visible.includes(text));
      }
      if (name === "sparse") assert.equal(await page.$$eval("h2", (els) => els.length), 0);
      await page.setViewport({ width: 794, height: 1123 });
      await page.screenshot({ path: path.join(output, `${name}-screen.png`), fullPage: name !== "stress" });
      await page.close();
    }
  } finally { await browser.close(); }

  // Run the unmodified production entry point in an isolated copy so an
  // existing local resume.pdf and the private source JSON are never replaced.
  for (const [name, input, template] of [
    ["clarity-ats", data, "clarity-ats"], ["sparse", sparse, "clarity-ats"], ["stress", stress, "clarity-ats"],
    ["evidence", evidence, "clarity-ats"],
    ...["default", "iconic", "ultra", "apex-ats"].map((id) => [id, data, id]),
  ]) {
    const inputPath = path.join(output, `${name}.json`);
    fs.writeJsonSync(inputPath, { ...input, template });
    execFileSync(process.execPath, [path.join(output, "generate-pdf.js")], {
      env: { ...process.env, NODE_PATH: path.join(root, "node_modules"), RESUME_JSON_PATH: inputPath },
      timeout: 120000, stdio: "pipe",
    });
    fs.moveSync(path.join(output, "resume.pdf"), path.join(output, `${name}.pdf`));
    console.log(`PASS: ${name} production PDF`);
  }
  console.log("PASS: admin discovery, preview, selection callback, sparse data, long content, URL wrapping, offline Clarity assets");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
