const fs = require("fs-extra");
const path = require("path");

const PROJECT_SYSTEM_PROMPT = `You are an expert technical resume writer. Your task is to write professional, ATS-optimized resume bullet points for a software engineering project.

CRITICAL RULES:
1. Write exactly 2 to 3 bullet points.
2. Seamlessly integrate the provided "Technologies Used" into the sentences to explain *how* they were used.
3. Start each bullet point with a strong action verb (e.g., Architected, Engineered, Developed, Built).
4. DO NOT create a separate "Skills" or "Technologies" list.
5. You MUST return ONLY a valid JSON array of strings. Do not include markdown code blocks (like \`\`\`json), labels, or any conversational text.

EXAMPLE INPUT:
Project Name: VibeNet
Project Description: Secure Real-Time End-to-End Encrypted Chat Platform.
Technologies Used: Next.js 16, TypeScript, Web Crypto API, Tailwind CSS, Go, WebSocket, DynamoDB, PostgreSQL, AWS EC2.

EXAMPLE OUTPUT:
[
  "Built a real-time E2EE chat client using Next.js 16 and TypeScript with Web Crypto API-based encryption, styled with Tailwind CSS.",
  "Developed a Go backend with WebSocket-based real-time messaging and DynamoDB/PostgreSQL for data storage, deployed on AWS EC2.",
  "Architected the system as a multi-repository monorepo with Git submodules and comprehensive architecture documentation."
]`;

const WORK_SYSTEM_PROMPT = `You are an expert technical resume writer. Your task is to rewrite rough work experience notes into professional, ATS-optimized resume bullet points.

CRITICAL RULES:
1. Write exactly 2 to 3 bullet points.
2. Start each bullet point with a strong action verb (e.g., Developed, Collaborated, Designed, Optimized).
3. Focus on impact, technical achievements, and responsibilities. Improve the grammar and vocabulary of the rough notes.
4. You MUST return ONLY a valid JSON array of strings. Do not include markdown code blocks (like \`\`\`json), labels, or any conversational text.

EXAMPLE INPUT:
Company: Applantics (PVT) Ltd
Position: Software Engineering Intern
Rough Notes: I worked on live client projects. I did debugging and backend integration. Also talked to senior engineers for code reviews. I learned Laravel and Flutter on the job for cross-platform features.

EXAMPLE OUTPUT:
[
  "Contributed to application development, debugging, backend integration, and feature testing across live client projects.",
  "Collaborated with senior engineers on code reviews and release preparation, gaining exposure to production-quality development standards.",
  "Learned and applied additional technologies on the job, including Laravel and Flutter, to support cross-platform feature development."
]`;

function buildPrompt() {
  const mode = process.env.PROMPT_MODE;

  if (mode === "project") {
    return {
      system: PROJECT_SYSTEM_PROMPT,
      user: [
        `Project Name: ${process.env.REPO_NAME || ""}`,
        `Project Description: ${process.env.REPO_DESCRIPTION || ""}`,
        `Technologies Used: ${process.env.TECH_STACK || ""}`,
      ].join("\n"),
    };
  }

  if (mode === "work") {
    return {
      system: WORK_SYSTEM_PROMPT,
      user: [
        `Company: ${process.env.ISSUE_COMPANY || ""}`,
        `Position: ${process.env.ISSUE_POSITION || ""}`,
        `Rough Notes: ${process.env.ISSUE_ROUGH_DESCRIPTION || ""}`,
      ].join("\n"),
    };
  }

  throw new Error(`Unknown PROMPT_MODE: ${mode}. Expected "project" or "work".`);
}

async function callGithubModels(systemPrompt, userPrompt) {
  const apiUrl = process.env.AI_API_URL || "https://models.github.ai/inference/chat/completions";
  const model = process.env.AI_MODEL || "openai/gpt-4o-mini";

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.AI_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API request failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callGemini(systemPrompt, userPrompt) {
  const model = process.env.AI_MODEL || "gemini-1.5-flash";
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.AI_API_KEY}`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI API request failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
}

function extractJsonArray(rawText) {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
    throw new Error("AI response was not a JSON array of strings.");
  }
  return parsed;
}

async function main() {
  if (!process.env.AI_API_KEY) {
    throw new Error("AI_API_KEY is required.");
  }

  const { system, user } = buildPrompt();
  const provider = process.env.AI_PROVIDER || "github-models";

  const rawText =
    provider === "gemini" ? await callGemini(system, user) : await callGithubModels(system, user);

  const bullets = extractJsonArray(rawText);

  const outputPath = path.join(process.cwd(), process.env.BULLETS_FILE || "bullets.json");
  await fs.writeJson(outputPath, bullets, { spaces: 2 });
  console.log(`Generated ${bullets.length} bullet points -> ${outputPath}`);
  console.log(bullets);
}

main().catch((error) => {
  console.error("generate-bullets.js failed:", error);
  process.exit(1);
});
