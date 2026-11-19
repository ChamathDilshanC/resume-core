const test = require("node:test");
const assert = require("node:assert/strict");
const { validateResume, analyzeAchievementEvidence } = require("./resume-validation");

test("flags missing required resume fields", () => {
  const result = validateResume({ basics: {}, work: [], skills: [] });
  assert.ok(result.findings.some((item) => item.field === "basics.name"));
  assert.ok(result.findings.some((item) => item.field === "basics.email"));
  assert.ok(result.findings.some((item) => item.field === "skills"));
});

test("detects duplicated skills and repeated action verbs", () => {
  const resume = {
    basics: { name: "Test Person", email: "test@example.com", label: "Engineer", summary: "Engineer." },
    skills: [{ name: "Cloud", keywords: ["AWS", "Docker"] }, { name: "DevOps", keywords: ["docker"] }],
    work: [{ startDate: "2024-01", endDate: "", highlights: [
      "Developed a service", "Developed an API", "Developed integrations",
      "Developed tests", "Developed tooling",
    ] }],
    projects: [],
  };
  const result = validateResume(resume);
  assert.ok(result.findings.some((item) => item.description.includes("Duplicate skill")));
  assert.ok(result.findings.some((item) => item.description.includes("Repeated action verb")));
});

test("corrects verified projekts typo only as a suggested correction", () => {
  const result = validateResume({
    basics: { name: "Test", email: "test@example.com", label: "Engineer", summary: "Test." },
    skills: [{ name: "Development", keywords: ["JavaScript"] }],
    work: [],
    projects: [{ includeInResume: true, highlights: ["Delivered projekts"] }],
  });
  const typo = result.findings.find((item) => item.description.includes("projekts"));
  assert.ok(typo);
  assert.equal(typo.automaticCorrectionSafe, true);
});

test("does not invent metrics or convert weak achievements into confirmed claims", () => {
  const result = validateResume({
    basics: { name: "Test", email: "test@example.com", label: "Engineer", summary: "Engineer." },
    skills: [{ name: "Cloud", keywords: ["AWS", "Docker"] }],
    work: [{ startDate: "2024", endDate: "Present", highlights: ["Managed cloud infrastructure."] }],
    projects: [],
  });
  assert.ok(result.findings.some((item) =>
    item.field.includes("highlights") &&
    item.description.includes("No verified quantifiable result")
  ));
});

test("returns only metrics already present in source or documented project evidence", () => {
  const resume = {
    work: [{ highlights: [
      "Developed integrations across 10+ live client projects.",
      "Resolved 150+ production bugs within the first 3 weeks.",
    ] }],
    projects: [{
      evidence: { contribution: "The system includes 22 built-in email templates." },
    }],
  };
  const suggestions = analyzeAchievementEvidence(resume);
  assert.equal(suggestions.length, 2);
  assert.ok(suggestions.every((item) => item.status === "verified" || item.status === "documented-evidence"));
});
