const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { buildPrompt, parseDraft } = require("./resume-writing");

test("automated project drafts receive saved evidence and role context, including renamed projects", () => {
  const evidence = { problem: "Manual releases", contribution: "Wrote release scripts", result: "Published packages" };
  const prompt = buildPrompt({ PROMPT_MODE: "project", REPO_NAME: "repo", SOURCE_REPO_OWNER: "owner",
    SOURCE_REPO_NAME: "repo", TECH_STACK: "JavaScript, Shell" }, {
    basics: { label: "DevOps Engineer", jobDescription: "Build release pipelines" },
    projects: [{ name: "Friendly name", repoFullName: "owner/repo", technologies: ["GitHub Actions"],
      role: "Contributor", evidence }],
  });
  const input = JSON.parse(prompt.user);
  assert.deepEqual(input.project.evidence, evidence);
  assert.equal(input.target.targetRole, "DevOps Engineer");
  assert.equal(input.target.jobDescription, "Build release pipelines");
  assert.deepEqual(input.project.technologies, ["JavaScript", "Shell", "GitHub Actions"]);
  assert.equal(input.project.role, "Contributor");
});

test("work generation preserves notes and explicit target overrides", () => {
  const prompt = buildPrompt({ PROMPT_MODE: "work", ISSUE_ROUGH_DESCRIPTION: "Reviewed pull requests with a mentor.",
    TARGET_ROLE: "QA Engineer", JOB_DESCRIPTION: "Testing role" }, { basics: { label: "Developer" } });
  const input = JSON.parse(prompt.user);
  assert.equal(input.notes, "Reviewed pull requests with a mentor.");
  assert.equal(input.target.targetRole, "QA Engineer");
  assert.throws(() => buildPrompt({ PROMPT_MODE: "invalid" }), /Unknown PROMPT_MODE/);
});

test("draft parser accepts project objects and work arrays, rejects malformed and padded output", () => {
  const draft = { description: "Release automation for packages.", highlights: ["Automated package releases using shell scripts."] };
  assert.deepEqual(parseDraft("```json\n" + JSON.stringify(draft) + "\n```", "project"), draft);
  assert.deepEqual(parseDraft('["Reviewed pull requests."]', "work"), ["Reviewed pull requests."]);
  for (const value of [null, [], { description: "", highlights: [] }, { description: "A system", highlights: [" "] },
    { ...draft, highlights: Array(4).fill("Padding") }, { ...draft, description: "word ".repeat(36) },
    { ...draft, highlights: ["word ".repeat(46)] }]) {
    assert.throws(() => parseDraft(JSON.stringify(value), "project"));
  }
});

test("merge accepts new and legacy drafts, keeps saved evidence, rejects corrupt output without changing data", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "resume-writing-test-"));
  const resumePath = path.join(dir, "resume.json");
  const bulletsPath = path.join(dir, "bullets.json");
  const evidence = { contribution: "Wrote scripts", result: "Published packages" };
  const initial = { projects: [{ name: "Display name", repoFullName: "owner/repo", evidence,
    role: "Contributor", driveFolder: { folderId: "keep" }, technologies: ["Shell"] }] };
  const env = { ...process.env, RESUME_JSON_PATH: resumePath, BULLETS_FILE: "bullets.json",
    REPO_NAME: "repo", REPO_DESCRIPTION: "Raw repository description", SOURCE_REPO_OWNER: "owner", SOURCE_REPO_NAME: "repo" };
  const run = () => execFileSync(process.execPath, [path.resolve(__dirname, "../merge-project.js")], { cwd: dir, env, stdio: "pipe" });
  try {
    fs.writeFileSync(resumePath, JSON.stringify(initial));
    fs.writeFileSync(bulletsPath, JSON.stringify({ description: "A release automation system.", highlights: ["Wrote release scripts."] }));
    run();
    let saved = JSON.parse(fs.readFileSync(resumePath));
    assert.equal(saved.projects.length, 1);
    assert.equal(saved.projects[0].description, "A release automation system.");
    assert.deepEqual(saved.projects[0].evidence, evidence);
    assert.equal(saved.projects[0].driveFolder.folderId, "keep");
    fs.writeFileSync(bulletsPath, '["Updated release scripts."]');
    run();
    saved = JSON.parse(fs.readFileSync(resumePath));
    assert.equal(saved.projects[0].description, "Raw repository description");
    const before = fs.readFileSync(resumePath, "utf8");
    fs.writeFileSync(bulletsPath, '{"description":42,"highlights":["Some work"]}');
    assert.throws(run);
    assert.equal(fs.readFileSync(resumePath, "utf8"), before);
  } finally {
    // A new, fixed-prefix OS temp directory created by this test only.
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(os.tmpdir()));
    assert(path.basename(dir).startsWith("resume-writing-test-"));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
