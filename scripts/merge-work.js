const fs = require("fs-extra");
const path = require("path");

async function main() {
  const company = process.env.ISSUE_COMPANY;
  const position = process.env.ISSUE_POSITION;
  if (!company || !position) {
    throw new Error("ISSUE_COMPANY and ISSUE_POSITION are required.");
  }

  const resumeJsonPath = path.join(process.cwd(), "resume.json");
  const bulletsPath = path.join(process.cwd(), process.env.BULLETS_FILE || "bullets.json");

  const resume = await fs.readJson(resumeJsonPath);
  const highlights = await fs.readJson(bulletsPath);

  const workEntry = {
    name: company,
    position,
    url: "",
    startDate: process.env.ISSUE_START_DATE || "",
    endDate: process.env.ISSUE_END_DATE || "",
    summary: "",
    highlights,
  };

  resume.work = resume.work || [];
  const existingIndex = resume.work.findIndex(
    (entry) => entry.name === company && entry.position === position
  );

  if (existingIndex >= 0) {
    resume.work[existingIndex] = { ...resume.work[existingIndex], ...workEntry };
    console.log(`Updated existing work entry for "${position} @ ${company}".`);
  } else {
    resume.work.unshift(workEntry);
    console.log(`Added new work entry for "${position} @ ${company}".`);
  }

  await fs.writeJson(resumeJsonPath, resume, { spaces: 2 });
}

main().catch((error) => {
  console.error("merge-work.js failed:", error);
  process.exit(1);
});
