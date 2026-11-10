const {
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  fileBlob,
  inspectOptionalImages,
  inspectPdf,
  notificationMessage,
  parsePositiveInteger,
  postMultipart,
  readDisplayName,
  requireEnv,
} = require("./lib/delivery-utils");

const DISCORD_DEFAULT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const DISCORD_MAX_ATTACHMENTS = 10;

function validatedWebhookUrl(rawUrl) {
  let webhookUrl;
  try {
    webhookUrl = new URL(rawUrl);
  } catch {
    throw new Error("DISCORD_WEBHOOK_URL must be a valid URL.");
  }

  const host = webhookUrl.hostname.toLowerCase();
  const officialHost = host === "discord.com"
    || host.endsWith(".discord.com")
    || host === "discordapp.com"
    || host.endsWith(".discordapp.com");
  const webhookPath = /^\/api(?:\/v\d+)?\/webhooks\/[^/]+\/[^/]+/.test(webhookUrl.pathname);
  if (webhookUrl.protocol !== "https:" || !officialHost || !webhookPath) {
    throw new Error("DISCORD_WEBHOOK_URL must be an official HTTPS Discord webhook URL.");
  }

  webhookUrl.searchParams.set("wait", "true");
  return webhookUrl.toString();
}

async function deliverDiscord(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const rawWebhookUrl = requireEnv(env, "DISCORD_WEBHOOK_URL");
  const webhookUrl = validatedWebhookUrl(rawWebhookUrl);
  const pdfPath = env.RESUME_PDF_PATH || "resume.pdf";
  const displayName = readDisplayName(env.RESUME_NAME_PATH || "resume-name.txt");
  const message = String(env.RESUME_NOTIFICATION_MESSAGE || notificationMessage(displayName)).slice(0, 2000);
  const maxUploadBytes = parsePositiveInteger(
    env.DISCORD_MAX_UPLOAD_BYTES,
    DISCORD_DEFAULT_MAX_UPLOAD_BYTES,
    "DISCORD_MAX_UPLOAD_BYTES",
  );
  const timeoutMs = options.timeoutMs ?? parsePositiveInteger(
    env.DELIVERY_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    "DELIVERY_TIMEOUT_MS",
  );
  const maxRetries = options.maxRetries ?? parsePositiveInteger(
    env.DELIVERY_MAX_RETRIES,
    DEFAULT_MAX_RETRIES,
    "DELIVERY_MAX_RETRIES",
  );

  const pdf = inspectPdf(pdfPath, maxUploadBytes);
  const { images, skipped } = inspectOptionalImages(env.DELIVERY_IMAGE_PATHS, {
    maxBytes: maxUploadBytes,
    logger,
    channel: "discord",
  });
  const files = [pdf, ...images];
  if (files.length > DISCORD_MAX_ATTACHMENTS) {
    throw new Error(`Discord supports at most ${DISCORD_MAX_ATTACHMENTS} attachments per message.`);
  }
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > maxUploadBytes) {
    throw new Error(`Discord attachments exceed the configured ${maxUploadBytes}-byte request limit.`);
  }

  await postMultipart({
    url: webhookUrl,
    createForm: () => {
      const form = new FormData();
      const attachments = files.map((file, index) => ({
        id: index,
        filename: index === 0 ? displayName : file.filename,
        description: index === 0 ? "Generated resume PDF" : "Optional resume image",
      }));
      form.append("payload_json", JSON.stringify({
        content: message,
        allowed_mentions: { parse: [] },
        attachments,
      }));
      files.forEach((file, index) => {
        form.append(`files[${index}]`, fileBlob(file), attachments[index].filename);
      });
      return form;
    },
    service: "Discord",
    secrets: [rawWebhookUrl, webhookUrl],
    fetchImpl: options.fetchImpl,
    timeoutMs,
    maxRetries,
    sleep: options.sleep,
    apiErrorMessage: (data) => data?.message || "Discord rejected the webhook request",
  });

  return { displayName, imagesSent: images.length, imagesSkipped: skipped };
}

if (require.main === module) {
  deliverDiscord()
    .then((result) => {
      console.log(`[discord] Sent ${result.displayName} and ${result.imagesSent} optional image(s).`);
    })
    .catch((error) => {
      console.error(`[discord] Delivery failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  DISCORD_DEFAULT_MAX_UPLOAD_BYTES,
  DISCORD_MAX_ATTACHMENTS,
  deliverDiscord,
  validatedWebhookUrl,
};
