const fs = require("fs-extra");
const crypto = require("crypto");

const FIELD_MAP = {
  Company: "ISSUE_COMPANY",
  Position: "ISSUE_POSITION",
  "Start Date": "ISSUE_START_DATE",
  "End Date": "ISSUE_END_DATE",
  "Rough Description": "ISSUE_ROUGH_DESCRIPTION",
};

function parseIssueBody(body) {
  const sections = body.split(/^### /m).slice(1);
  const fields = {};

  for (const section of sections) {
    const newlineIndex = section.indexOf("\n");
    const label = section.slice(0, newlineIndex).trim();
    let value = section.slice(newlineIndex + 1).trim();

    if (value === "_No response_") {
      value = "";
    }

    if (FIELD_MAP[label]) {
      fields[FIELD_MAP[label]] = value;
    }
  }

  return fields;
}

async function main() {
  const issueBody = process.env.ISSUE_BODY;
  if (!issueBody) {
    throw new Error("ISSUE_BODY is required.");
  }

  const fields = parseIssueBody(issueBody);

  for (const key of Object.values(FIELD_MAP)) {
    if (!fields[key]) {
      console.warn(`Warning: field ${key} was not found in the issue body.`);
    }
  }

  console.log("Parsed issue fields:", fields);

  const githubEnv = process.env.GITHUB_ENV;
  if (githubEnv) {
    const lines = Object.entries(fields).map(([key, value]) => {
      const delimiter = `EOF_${crypto.randomBytes(8).toString("hex")}`;
      return `${key}<<${delimiter}\n${value}\n${delimiter}`;
    });
    await fs.appendFile(githubEnv, lines.join("\n") + "\n");
  }
}

main().catch((error) => {
  console.error("parse-issue.js failed:", error);
  process.exit(1);
});
