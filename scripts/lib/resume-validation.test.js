const test = require("node:test");
const assert = require("node:assert/strict");
const { validateResume } = require("./resume-validation");

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
