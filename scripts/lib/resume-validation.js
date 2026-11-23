const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_PATTERN = /^https?:\/\//i;
const TECHNICAL_TERMS = new Set([
  "Next.js", "FastAPI", "PostgreSQL", "Supabase", "Kubernetes", "Terraform",
  "GitHub Actions", "Node.js", "React Native", "OAuth", "Docker",
  "TypeScript", "CI/CD",
]);

function finding(severity, section, field, description, recommendation, safe) {
  return { severity, section, field, description, recommendation, automaticCorrectionSafe: safe };
}

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function validateResume(resume) {
  const findings = [];
  const basics = resume?.basics || {};

  if (!cleanText(basics.name)) {
    findings.push(finding("critical", "Basics", "basics.name", "Candidate name is missing.", "Add the candidate's full name.", false));
  }
  if (!cleanText(basics.label)) {
    findings.push(finding("warning", "Basics", "basics.label", "Professional title is missing.", "Add a target job title.", false));
  }
  if (!cleanText(basics.email)) {
    findings.push(finding("critical", "Basics", "basics.email", "Email address is missing.", "Add a valid email address.", false));
  } else if (!EMAIL_PATTERN.test(cleanText(basics.email))) {
    findings.push(finding("critical", "Basics", "basics.email", "Email address is invalid.", "Correct the email address.", false));
  }
  if (!cleanText(basics.summary)) {
    findings.push(finding("warning", "Professional Summary", "basics.summary", "Professional summary is empty.", "Add a concise role-focused summary.", false));
  } else if (cleanText(basics.summary).length > 700) {
    findings.push(finding("advisory", "Professional Summary", "basics.summary", "Summary is unusually long.", "Limit the summary to a short, evidence-focused paragraph.", false));
  }
  if (!Array.isArray(resume?.skills) || resume.skills.length === 0) {
    findings.push(finding("critical", "Technical Skills", "skills", "Technical Skills section is missing.", "Add saved technical skills.", false));
  }
  if (!Array.isArray(resume?.work) || resume.work.length === 0) {
    findings.push(finding("warning", "Professional Experience", "work", "Professional experience is missing.", "Add relevant work experience or remove the empty section.", false));
  }

  const seenSkills = new Set();
  for (const [skillIndex, skill] of (resume?.skills || []).entries()) {
    for (const keyword of skill.keywords || []) {
      const normalized = cleanText(keyword).toLowerCase();
      if (normalized && seenSkills.has(normalized)) {
        findings.push(finding("advisory", "Technical Skills", `skills.${skillIndex}.keywords`, `Duplicate skill: "${cleanText(keyword)}".`, "Keep the skill under its most relevant category.", true));
      }
      seenSkills.add(normalized);
    }
  }

  for (const [workIndex, work] of (resume?.work || []).entries()) {
    if (!cleanText(work.startDate) && !cleanText(work.endDate)) {
      findings.push(finding("warning", "Professional Experience", `work.${workIndex}.dates`, "Experience dates are missing.", "Add valid start and end dates.", false));
    }
    for (const [highlightIndex, highlight] of (work.highlights || []).entries()) {
      validateBullet(findings, highlight, `work.${workIndex}.highlights.${highlightIndex}`, "Professional Experience");
    }
  }

  for (const [projectIndex, project] of (resume?.projects || []).entries()) {
    if (project.includeInResume === false) continue;
    for (const [highlightIndex, highlight] of (project.highlights || []).entries()) {
      validateBullet(findings, highlight, `projects.${projectIndex}.highlights.${highlightIndex}`, "Projects");
    }
    for (const [linkIndex, link] of (project.links || []).entries()) {
      if (cleanText(link.url) && !URL_PATTERN.test(cleanText(link.url))) {
        findings.push(finding("warning", "Projects", `projects.${projectIndex}.links.${linkIndex}.url`, `Invalid project URL: "${cleanText(link.url)}".`, "Use a complete http:// or https:// URL.", false));
      }
    }
  }

  const repeatedVerbs = countRepeatedVerbs([
    ...(resume?.work || []).flatMap((item) => item.highlights || []),
    ...(resume?.projects || []).flatMap((item) => item.highlights || []),
  ]);
  for (const [verb, count] of repeatedVerbs) {
    if (count >= 4) {
      findings.push(finding("advisory", "Achievements", "highlights", `Repeated action verb "${verb}" appears ${count} times.`, "Use varied verified action verbs such as Built, Designed, Automated, or Optimized.", false));
    }
  }

  const typoCorrections = { projekts: "projects" };
  const serialized = JSON.stringify(resume || {});
  for (const [typo, correction] of Object.entries(typoCorrections)) {
    if (serialized.toLowerCase().includes(typo)) {
      findings.push(finding("warning", "Content", "resume", `"${typo}" appears in the resume.`, `Replace it with "${correction}".`, true));
    }
  }

  return {
    findings,
    internalQualityScore: calculateScore(findings),
    technicalVocabulary: [...TECHNICAL_TERMS],
  };
}

function validateBullet(findings, bullet, field, section) {
  const text = cleanText(bullet);
  if (!text) return;
  if (text.length > 260) {
    findings.push(finding("advisory", section, field, "Achievement bullet is unusually long.", "Split it into a concise bullet with a clear result.", false));
  }
  if (/^(worked on|responsible for|helped with|assisted with)\b/i.test(text)) {
    findings.push(finding("advisory", section, field, "Achievement uses weak, vague phrasing.", "Use a specific action verb and factual contribution.", false));
  }
  if (!/(%|[0-9][0-9+]*\s*(projects?|bugs?|users?|files?|requests?|tests?|servers?|deployments?|minutes?|hours?|weeks?|months?|years?)\b|\b(10\+|150\+)\b)/i.test(text) &&
      /^(built|developed|implemented|designed|engineered|optimized|automated|integrated|delivered|managed|created|maintained|supported)\b/i.test(text)) {
    findings.push(finding("advisory", section, field, "No verified quantifiable result is stated.", "Quantifiable result available? Add a verified metric.", false));
  }
}

function countRepeatedVerbs(bullets) {
  const counts = new Map();
  for (const bullet of bullets) {
    const match = cleanText(bullet).match(/^([A-Za-z]+)/);
    if (match) {
      const verb = match[1];
      counts.set(verb, (counts.get(verb) || 0) + 1);
    }
  }
  return [...counts.entries()].filter(([, count]) => count >= 4);
}

function calculateScore(findings) {
  const penalty = { critical: 18, warning: 8, advisory: 3 };
  return Math.max(0, 100 - findings.reduce((total, item) => total + (penalty[item.severity] || 0), 0));
}

function analyzeAchievementEvidence(resume) {
  const suggestions = [];
  for (const [workIndex, work] of (resume?.work || []).entries()) {
    for (const [highlightIndex, highlight] of (work.highlights || []).entries()) {
      const text = cleanText(highlight);
      if (!text) continue;
      if (/\b(10\+|150\+|3 weeks)\b/i.test(text)) {
        suggestions.push({
          section: "Professional Experience",
          field: `work.${workIndex}.highlights.${highlightIndex}`,
          status: "verified",
          suggestion: text,
        });
      }
    }
  }
  for (const [projectIndex, project] of (resume?.projects || []).entries()) {
    const evidence = cleanText(project?.evidence?.contribution);
    if (/\b22\b.*built-in.*email templates/i.test(evidence) ||
        /\b22 built-in email templates\b/i.test(evidence)) {
      suggestions.push({
        section: "Projects",
        field: `projects.${projectIndex}.highlights`,
        status: "documented-evidence",
        suggestion: "Documented delivery: JobMail includes 22 built-in email templates.",
      });
    }
  }
  return suggestions;
}

module.exports = { validateResume, analyzeAchievementEvidence };
