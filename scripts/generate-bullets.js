const fs = require("fs-extra");
const path = require("path");

const PROJECT_SYSTEM_PROMPT = `You are an expert technical resume writer. Your task is to write professional, ATS-optimized resume bullet points for a software engineering project.

CRITICAL RULES:
1. Write exactly 2 to 3 bullet points.
2. Seamlessly integrate the provided "Technologies Used" into the sentences to explain *how* they were used.
3. Start each bullet point with a strong action verb (e.g., Architected, Engineered, Developed, Built).
4. DO NOT create a separate "Skills" or "Technologies" list.
5. You MUST NOT mention, imply, or name-drop any technology, language, framework, or tool that is not
   explicitly listed in "Technologies Used" — even if it seems typical or likely for a project like this
   based on its name or description. If "Technologies Used" doesn't mention a database, AI library, or
   framework, do not invent one. Only describe capabilities using the exact technologies given.
6. You MUST return ONLY a valid JSON array of strings. Do not include markdown code blocks (like \`\`\`json), labels, or any conversational text.

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

class AIRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "AIRequestError";
    this.status = status;
  }
}

// 503 = model overloaded ("high demand"), 429 = per-key rate/quota limited.
// Both are worth retrying against a different model or key rather than
// failing the whole pipeline run.
function isRetryableStatus(status) {
  return status === 503 || status === 429;
}

// Gemini 1.5 and 2.0 model families were shut down during 2026 — only the
// 2.5+/3.x families are still live on v1beta. Cheapest/fastest first.
const GEMINI_MODEL_FALLBACKS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite"];

// AI_API_KEY may hold a single key or a comma-separated list. Multiple keys
// (e.g. from separate Google accounts) let us hop to a fresh quota when one
// key gets rate-limited (429) instead of failing the whole workflow run.
function getApiKeys() {
  return (process.env.AI_API_KEY || "")
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean);
}

async function callGemini(systemPrompt, userPrompt, model, apiKey) {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
      generationConfig: { temperature: 0.3 },
    }),
  });

  if (!response.ok) {
    throw new AIRequestError(`AI API request failed (${response.status}): ${await response.text()}`, response.status);
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

async function generateBulletsText(systemPrompt, userPrompt) {
  const apiKeys = getApiKeys();
  if (apiKeys.length === 0) {
    throw new Error("AI_API_KEY is required.");
  }

  const configuredModel = process.env.AI_MODEL;
  const models = configuredModel
    ? [configuredModel, ...GEMINI_MODEL_FALLBACKS.filter((model) => model !== configuredModel)]
    : GEMINI_MODEL_FALLBACKS;

  let lastError;
  for (const model of models) {
    for (const apiKey of apiKeys) {
      try {
        return await callGemini(systemPrompt, userPrompt, model, apiKey);
      } catch (error) {
        lastError = error;
        if (!(error instanceof AIRequestError) || !isRetryableStatus(error.status)) {
          throw error;
        }
        // Overloaded/rate-limited: fall through and retry with the next key,
        // then the next model once all keys for this model are exhausted.
      }
    }
  }

  throw lastError;
}

async function main() {
  const { system, user } = buildPrompt();
  const rawText = await generateBulletsText(system, user);
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
