const fs = require("node:fs");
const path = require("node:path");

const IMAGE_MIME_TYPES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 30_000;

function requireEnv(env, name) {
  const value = String(env[name] || "").trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function readDisplayName(namePath = "resume-name.txt", fallback = "resume.pdf") {
  try {
    const name = fs.readFileSync(namePath, "utf8").trim();
    return name || fallback;
  } catch {
    return fallback;
  }
}

function notificationMessage(displayName) {
  return `DevResume generated a new resume: ${displayName}. The latest PDF is attached.`;
}

function parseImagePaths(rawValue) {
  return [...new Set(
    String(rawValue || "")
      .split(/[\r\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean),
  )];
}

function inspectFile(filePath, { label, maxBytes, mimeType }) {
  const resolvedPath = path.resolve(filePath);
  let stats;
  try {
    stats = fs.statSync(resolvedPath);
  } catch (error) {
    if (error.code === "ENOENT") throw new Error(`${label} does not exist: ${filePath}`);
    throw new Error(`Unable to inspect ${label.toLowerCase()}: ${filePath}`);
  }

  if (!stats.isFile()) throw new Error(`${label} is not a file: ${filePath}`);
  if (stats.size === 0) throw new Error(`${label} is empty: ${filePath}`);
  if (stats.size > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte upload limit: ${filePath}`);
  }

  return {
    path: resolvedPath,
    filename: path.basename(resolvedPath),
    size: stats.size,
    mimeType,
  };
}

function inspectPdf(filePath, maxBytes) {
  if (path.extname(filePath).toLowerCase() !== ".pdf") {
    throw new Error(`Resume PDF must use a .pdf extension: ${filePath}`);
  }
  return inspectFile(filePath, {
    label: "Resume PDF",
    maxBytes,
    mimeType: "application/pdf",
  });
}

function inspectOptionalImages(rawPaths, { maxBytes, logger = console, channel }) {
  const images = [];
  let skipped = 0;

  for (const filePath of parseImagePaths(rawPaths)) {
    if (!fs.existsSync(filePath)) {
      logger.warn(`[${channel}] Optional image not found; skipping: ${filePath}`);
      skipped += 1;
      continue;
    }

    const extension = path.extname(filePath).toLowerCase();
    const mimeType = IMAGE_MIME_TYPES.get(extension);
    if (!mimeType) {
      throw new Error(`Unsupported optional image type for ${channel}: ${filePath}`);
    }

    images.push(inspectFile(filePath, {
      label: "Optional image",
      maxBytes,
      mimeType,
    }));
  }

  return { images, skipped };
}

function fileBlob(file) {
  return new Blob([fs.readFileSync(file.path)], { type: file.mimeType });
}

function redactSecrets(message, secrets) {
  let redacted = String(message || "Unknown error");
  for (const secret of secrets.filter(Boolean)) {
    redacted = redacted.split(String(secret)).join("[REDACTED]");
    try {
      redacted = redacted.split(encodeURIComponent(String(secret))).join("[REDACTED]");
    } catch {
      // Ignore values that cannot be URL-encoded.
    }
  }
  return redacted;
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function retryDelayMs(response, data) {
  const headerValue = response.headers?.get?.("retry-after");
  const seconds = Number(headerValue ?? data?.parameters?.retry_after ?? data?.retry_after);
  if (!Number.isFinite(seconds) || seconds < 0) return 1_000;
  return Math.min(Math.ceil(seconds * 1_000), MAX_RETRY_DELAY_MS);
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function postMultipart({
  url,
  createForm,
  service,
  secrets = [],
  fetchImpl = global.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxRetries = DEFAULT_MAX_RETRIES,
  sleep = defaultSleep,
  isApiSuccess = () => true,
  apiErrorMessage = (data) => data?.description || data?.message || "API request rejected",
}) {
  if (typeof fetchImpl !== "function") throw new Error(`${service} requires a fetch implementation.`);

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;

    try {
      response = await fetchImpl(url, {
        method: "POST",
        body: createForm(),
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      const timedOut = error?.name === "AbortError" || controller.signal.aborted;
      throw new Error(timedOut ? `${service} request timed out.` : `${service} network request failed.`);
    }

    clearTimeout(timeout);
    const data = await responseJson(response);

    if (response.status === 429 && attempt < maxRetries) {
      await sleep(retryDelayMs(response, data));
      continue;
    }

    if (!response.ok || !isApiSuccess(data)) {
      const detail = redactSecrets(apiErrorMessage(data), secrets);
      throw new Error(`${service} API request failed (${response.status}): ${detail}`);
    }

    return data;
  }

  throw new Error(`${service} request failed after retries.`);
}

module.exports = {
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  fileBlob,
  inspectOptionalImages,
  inspectPdf,
  notificationMessage,
  parseImagePaths,
  parsePositiveInteger,
  postMultipart,
  readDisplayName,
  redactSecrets,
  requireEnv,
};
