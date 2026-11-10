const { deliverTelegram } = require("./send-telegram");
const { deliverDiscord } = require("./send-discord");
const { redactSecrets } = require("./lib/delivery-utils");

function telegramConfiguration(env) {
  const token = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(env.TELEGRAM_CHAT_ID || "").trim();
  if (!token && !chatId) return { configured: false, reason: "TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are not configured" };
  return { configured: true };
}

function discordConfiguration(env) {
  const webhookUrl = String(env.DISCORD_WEBHOOK_URL || "").trim();
  if (!webhookUrl) return { configured: false, reason: "DISCORD_WEBHOOK_URL is not configured" };
  return { configured: true };
}

async function runChannel(name, configuration, task, env) {
  if (!configuration.configured) {
    return { name, status: "skipped", detail: configuration.reason };
  }

  try {
    const result = await task();
    return { name, status: "success", result };
  } catch (error) {
    const detail = redactSecrets(error.message, [
      env.TELEGRAM_BOT_TOKEN,
      env.TELEGRAM_CHAT_ID,
      env.DISCORD_WEBHOOK_URL,
    ]);
    return { name, status: "failed", detail };
  }
}

async function runDeliveries(options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const telegramDelivery = options.telegramDelivery || deliverTelegram;
  const discordDelivery = options.discordDelivery || deliverDiscord;

  const results = await Promise.all([
    runChannel(
      "telegram",
      telegramConfiguration(env),
      () => telegramDelivery({ ...options, env, logger }),
      env,
    ),
    runChannel(
      "discord",
      discordConfiguration(env),
      () => discordDelivery({ ...options, env, logger }),
      env,
    ),
  ]);

  for (const result of results) {
    if (result.status === "success") {
      logger.log(`[${result.name}] Delivery succeeded.`);
    } else if (result.status === "skipped") {
      logger.warn(`[${result.name}] Delivery skipped: ${result.detail}.`);
    } else {
      logger.error(`[${result.name}] Delivery failed: ${result.detail}`);
    }
  }

  const failures = results.filter((result) => result.status === "failed");
  if (failures.length > 0) {
    throw new Error(`Configured resume delivery failed for: ${failures.map((result) => result.name).join(", ")}.`);
  }

  return results;
}

if (require.main === module) {
  runDeliveries().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  discordConfiguration,
  runDeliveries,
  telegramConfiguration,
};
