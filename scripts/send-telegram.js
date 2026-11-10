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

const TELEGRAM_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;
const TELEGRAM_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

async function telegramRequest(method, createForm, options) {
  const { token } = options;
  return postMultipart({
    url: `https://api.telegram.org/bot${token}/${method}`,
    createForm,
    service: "Telegram",
    secrets: [token],
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    maxRetries: options.maxRetries,
    sleep: options.sleep,
    isApiSuccess: (data) => data?.ok === true,
    apiErrorMessage: (data) => data?.description || "Telegram rejected the request",
  });
}

async function deliverTelegram(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const token = requireEnv(env, "TELEGRAM_BOT_TOKEN");
  const chatId = requireEnv(env, "TELEGRAM_CHAT_ID");
  const pdfPath = env.RESUME_PDF_PATH || "resume.pdf";
  const displayName = readDisplayName(env.RESUME_NAME_PATH || "resume-name.txt");
  const message = String(env.RESUME_NOTIFICATION_MESSAGE || notificationMessage(displayName)).slice(0, 1024);
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

  const pdf = inspectPdf(pdfPath, TELEGRAM_DOCUMENT_MAX_BYTES);
  const { images, skipped } = inspectOptionalImages(env.DELIVERY_IMAGE_PATHS, {
    maxBytes: TELEGRAM_PHOTO_MAX_BYTES,
    logger,
    channel: "telegram",
  });
  const requestOptions = {
    token,
    fetchImpl: options.fetchImpl,
    timeoutMs,
    maxRetries,
    sleep: options.sleep,
  };

  await telegramRequest("sendDocument", () => {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("caption", message);
    form.append("document", fileBlob(pdf), displayName);
    return form;
  }, requestOptions);

  for (const image of images) {
    await telegramRequest("sendPhoto", () => {
      const form = new FormData();
      form.append("chat_id", chatId);
      form.append("caption", `Resume image: ${image.filename}`);
      form.append("photo", fileBlob(image), image.filename);
      return form;
    }, requestOptions);
  }

  return { displayName, imagesSent: images.length, imagesSkipped: skipped };
}

if (require.main === module) {
  deliverTelegram()
    .then((result) => {
      console.log(`[telegram] Sent ${result.displayName} and ${result.imagesSent} optional image(s).`);
    })
    .catch((error) => {
      console.error(`[telegram] Delivery failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  TELEGRAM_DOCUMENT_MAX_BYTES,
  TELEGRAM_PHOTO_MAX_BYTES,
  deliverTelegram,
};
