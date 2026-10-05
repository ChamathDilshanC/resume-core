const fs = require("fs-extra");
const path = require("path");

const { buildPrompt, parseDraft } = require("./lib/resume-writing");

class AIRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "AIRequestError";
    this.status = status;
  }
}

// 503 = model overloaded ("high demand"), 429 = per-key rate/quota limited,
// 404 = model retired/not available to this key ("no longer available to new
// users" — availability is gated per-account, not just a global shutdown, so
// a different key can genuinely succeed here too). All three are worth
// retrying against a different model or key rather than failing the whole
// pipeline run.
function isRetryableStatus(status) {
  return status === 503 || status === 429 || status === 404;
}

// Prefer the "-latest" aliases: Google hot-swaps them to the newest release
// within that model family (with a 2-week deprecation notice), so they don't
// go stale the way a pinned version does — gemini-2.5-flash/flash-lite, the
// previous pins here, were retired for new users during 2026. Keep one
// concrete pin last in case both aliases have a simultaneous outage.
const GEMINI_MODEL_FALLBACKS = ["gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3.6-flash"];

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
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.3 },
    }),
  });

  if (!response.ok) {
    throw new AIRequestError(`AI API request failed (${response.status}): ${await response.text()}`, response.status);
  }

  const data = await response.json();
  return data.candidates[0].content.parts[0].text;
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
  const resumePath = process.env.RESUME_JSON_PATH || path.join(process.cwd(), "data", "resume.json");
  const resume = await fs.pathExists(resumePath) ? await fs.readJson(resumePath) : {};
  const { system, user } = buildPrompt(process.env, resume);
  const rawText = await generateBulletsText(system, user);
  const draft = parseDraft(rawText, process.env.PROMPT_MODE);

  const outputPath = path.join(process.cwd(), process.env.BULLETS_FILE || "bullets.json");
  await fs.writeJson(outputPath, draft, { spaces: 2 });
  console.log(`Generated resume draft -> ${outputPath}`);
}

main().catch((error) => {
  console.error("generate-bullets.js failed:", error);
  process.exit(1);
});
