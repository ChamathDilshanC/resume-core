const policy = require("./resume-writing-policy.json");

function buildPrompt(env, resume = {}, repositoryContext) {
  const target = {
    targetRole: env.TARGET_ROLE || resume.basics?.label || "",
    jobDescription: env.JOB_DESCRIPTION || resume.basics?.jobDescription || "",
  };
  if (env.PROMPT_MODE === "project") {
    const repoFullName = [env.SOURCE_REPO_OWNER, env.SOURCE_REPO_NAME].filter(Boolean).join("/");
    const existing = (resume.projects || []).find((p) =>
      (repoFullName && p.repoFullName === repoFullName) || p.name === env.REPO_NAME) || {};
    return {
      system: `${policy.evidence}\n\n${policy.repository}\n\n${policy.project}`,
      user: JSON.stringify({ target, repositoryContext, project: {
        name: env.REPO_NAME || "",
        description: env.REPO_DESCRIPTION || existing.description || "",
        technologies: [...new Set([...(env.TECH_STACK || "").split(","), ...(existing.technologies || [])]
          .map((t) => t.trim()).filter(Boolean))],
        role: existing.role || "",
        evidence: existing.evidence || {},
        highlights: existing.highlights || [],
      } }),
    };
  }
  if (env.PROMPT_MODE === "work") {
    return { system: `${policy.evidence}\n\n${policy.work}`, user: JSON.stringify({ target,
      company: env.ISSUE_COMPANY || "", position: env.ISSUE_POSITION || "",
      notes: env.ISSUE_ROUGH_DESCRIPTION || "",
    }) };
  }
  throw new Error(`Unknown PROMPT_MODE: ${env.PROMPT_MODE}. Expected "project" or "work".`);
}

function parseDraft(raw, mode) {
  const parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim());
  const bullets = mode === "project" ? parsed?.highlights : parsed;
  if (!Array.isArray(bullets) || bullets.length === 0 || bullets.length > 3 ||
      !bullets.every((b) => typeof b === "string" && b.trim() && b.trim().split(/\s+/).length <= 45)) {
    throw new Error("AI draft needs 1 to 3 nonempty, concise, evidence-based bullets. Add factual contribution notes and retry.");
  }
  const highlights = bullets.map((b) => b.trim());
  if (mode === "project") {
    if (typeof parsed.description !== "string" || !parsed.description.trim() ||
        parsed.description.trim().split(/\s+/).length > 35) {
      throw new Error("AI draft needs a factual project description of at most 35 words.");
    }
    return { description: parsed.description.trim(), highlights };
  }
  return highlights;
}

module.exports = { buildPrompt, parseDraft };
