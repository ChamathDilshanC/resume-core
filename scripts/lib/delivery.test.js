const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { TELEGRAM_DOCUMENT_MAX_BYTES, deliverTelegram } = require("../send-telegram");
const { deliverDiscord } = require("../send-discord");
const { runDeliveries } = require("../send-deliveries");

const TELEGRAM_TOKEN = "123456:test-telegram-token";
const TELEGRAM_CHAT_ID = "-1001234567890";
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/123456/test-discord-token";

function createFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "resume-delivery-test-"));
  const pdfPath = path.join(directory, "resume.pdf");
  const imagePath = path.join(directory, "preview.png");
  const namePath = path.join(directory, "resume-name.txt");
  fs.writeFileSync(pdfPath, "%PDF-1.4 test");
  fs.writeFileSync(imagePath, "png-test");
  fs.writeFileSync(namePath, "Chamath Dilshan Resume.pdf");
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, pdfPath, imagePath, namePath };
}

function mockResponse(status, data, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => data,
  };
}

function telegramEnv(fixture, overrides = {}) {
  return {
    TELEGRAM_BOT_TOKEN: TELEGRAM_TOKEN,
    TELEGRAM_CHAT_ID,
    RESUME_PDF_PATH: fixture.pdfPath,
    RESUME_NAME_PATH: fixture.namePath,
    ...overrides,
  };
}

function discordEnv(fixture, overrides = {}) {
  return {
    DISCORD_WEBHOOK_URL,
    RESUME_PDF_PATH: fixture.pdfPath,
    RESUME_NAME_PATH: fixture.namePath,
    ...overrides,
  };
}

function timeoutFetch(_url, { signal }) {
  return new Promise((_resolve, reject) => {
    signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });
}

function memoryLogger() {
  const messages = [];
  return {
    messages,
    log: (message) => messages.push(message),
    warn: (message) => messages.push(message),
    error: (message) => messages.push(message),
  };
}

test("Telegram uploads the generated PDF with sendDocument", async (t) => {
  const fixture = createFixture(t);
  const calls = [];
  const result = await deliverTelegram({
    env: telegramEnv(fixture),
    maxRetries: 0,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return mockResponse(200, { ok: true, result: { message_id: 1 } });
    },
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/sendDocument$/);
  assert.equal(calls[0].options.body.get("chat_id"), TELEGRAM_CHAT_ID);
  assert.equal(calls[0].options.body.get("document").name, "Chamath Dilshan Resume.pdf");
  assert.equal(result.imagesSent, 0);
});

test("Telegram uploads existing optional images with sendPhoto", async (t) => {
  const fixture = createFixture(t);
  const methods = [];
  const result = await deliverTelegram({
    env: telegramEnv(fixture, { DELIVERY_IMAGE_PATHS: fixture.imagePath }),
    maxRetries: 0,
    fetchImpl: async (url) => {
      methods.push(url.split("/").at(-1));
      return mockResponse(200, { ok: true, result: { message_id: methods.length } });
    },
  });

  assert.deepEqual(methods, ["sendDocument", "sendPhoto"]);
  assert.equal(result.imagesSent, 1);
});

test("Telegram validates required credentials", async (t) => {
  const fixture = createFixture(t);
  await assert.rejects(
    deliverTelegram({ env: telegramEnv(fixture, { TELEGRAM_BOT_TOKEN: "" }), maxRetries: 0 }),
    /TELEGRAM_BOT_TOKEN is required/,
  );
});

test("Telegram validates that the PDF exists", async (t) => {
  const fixture = createFixture(t);
  await assert.rejects(
    deliverTelegram({ env: telegramEnv(fixture, { RESUME_PDF_PATH: path.join(fixture.directory, "missing.pdf") }), maxRetries: 0 }),
    /Resume PDF does not exist/,
  );
});

test("Telegram rejects a PDF above the Bot API document limit before upload", async (t) => {
  const fixture = createFixture(t);
  fs.truncateSync(fixture.pdfPath, TELEGRAM_DOCUMENT_MAX_BYTES + 1);
  let requested = false;
  await assert.rejects(
    deliverTelegram({
      env: telegramEnv(fixture),
      maxRetries: 0,
      fetchImpl: async () => { requested = true; },
    }),
    /Resume PDF exceeds/,
  );
  assert.equal(requested, false);
});

test("Telegram reports API failures without exposing the bot token", async (t) => {
  const fixture = createFixture(t);
  await assert.rejects(
    deliverTelegram({
      env: telegramEnv(fixture),
      maxRetries: 0,
      fetchImpl: async () => mockResponse(400, { ok: false, description: `bad token ${TELEGRAM_TOKEN}` }),
    }),
    (error) => {
      assert.match(error.message, /Telegram API request failed \(400\)/);
      assert.equal(error.message.includes(TELEGRAM_TOKEN), false);
      return true;
    },
  );
});

test("Telegram honors rate-limit retry_after before retrying", async (t) => {
  const fixture = createFixture(t);
  const delays = [];
  let attempts = 0;
  await deliverTelegram({
    env: telegramEnv(fixture),
    maxRetries: 1,
    sleep: async (delay) => delays.push(delay),
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return mockResponse(429, { ok: false, parameters: { retry_after: 2 } });
      }
      return mockResponse(200, { ok: true, result: { message_id: 1 } });
    },
  });

  assert.equal(attempts, 2);
  assert.deepEqual(delays, [2000]);
});

test("Telegram reports network timeouts", async (t) => {
  const fixture = createFixture(t);
  await assert.rejects(
    deliverTelegram({ env: telegramEnv(fixture), fetchImpl: timeoutFetch, timeoutMs: 5, maxRetries: 0 }),
    /Telegram request timed out/,
  );
});

test("ambiguous network failures are not retried to avoid duplicate messages", async (t) => {
  const fixture = createFixture(t);
  let attempts = 0;
  await assert.rejects(
    deliverTelegram({
      env: telegramEnv(fixture),
      maxRetries: 2,
      fetchImpl: async () => {
        attempts += 1;
        throw new Error("connection reset after upload");
      },
    }),
    /Telegram network request failed/,
  );
  assert.equal(attempts, 1);
});

test("missing optional images are skipped without blocking the PDF", async (t) => {
  const fixture = createFixture(t);
  const logger = memoryLogger();
  let requests = 0;
  const result = await deliverTelegram({
    env: telegramEnv(fixture, { DELIVERY_IMAGE_PATHS: path.join(fixture.directory, "missing.png") }),
    logger,
    maxRetries: 0,
    fetchImpl: async () => {
      requests += 1;
      return mockResponse(200, { ok: true, result: { message_id: 1 } });
    },
  });

  assert.equal(requests, 1);
  assert.equal(result.imagesSkipped, 1);
  assert.match(logger.messages.join("\n"), /Optional image not found; skipping/);
});

test("Discord uploads the PDF and optional image with mentions disabled", async (t) => {
  const fixture = createFixture(t);
  let request;
  const result = await deliverDiscord({
    env: discordEnv(fixture, { DELIVERY_IMAGE_PATHS: fixture.imagePath }),
    maxRetries: 0,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return mockResponse(200, { id: "message-id" });
    },
  });

  const payload = JSON.parse(request.options.body.get("payload_json"));
  assert.equal(new URL(request.url).searchParams.get("wait"), "true");
  assert.deepEqual(payload.allowed_mentions, { parse: [] });
  assert.equal(payload.attachments.length, 2);
  assert.equal(request.options.body.get("files[0]").name, "Chamath Dilshan Resume.pdf");
  assert.equal(request.options.body.get("files[1]").name, "preview.png");
  assert.equal(result.imagesSent, 1);
});

test("Discord validates the webhook credential", async (t) => {
  const fixture = createFixture(t);
  await assert.rejects(
    deliverDiscord({ env: discordEnv(fixture, { DISCORD_WEBHOOK_URL: "" }), maxRetries: 0 }),
    /DISCORD_WEBHOOK_URL is required/,
  );
});

test("Discord validates that the PDF exists", async (t) => {
  const fixture = createFixture(t);
  await assert.rejects(
    deliverDiscord({ env: discordEnv(fixture, { RESUME_PDF_PATH: path.join(fixture.directory, "missing.pdf") }), maxRetries: 0 }),
    /Resume PDF does not exist/,
  );
});

test("Discord rejects attachments above the configured request limit before upload", async (t) => {
  const fixture = createFixture(t);
  let requested = false;
  await assert.rejects(
    deliverDiscord({
      env: discordEnv(fixture, {
        DELIVERY_IMAGE_PATHS: fixture.imagePath,
        DISCORD_MAX_UPLOAD_BYTES: "20",
      }),
      maxRetries: 0,
      fetchImpl: async () => { requested = true; },
    }),
    /Discord attachments exceed/,
  );
  assert.equal(requested, false);
});

test("Discord reports webhook API failures", async (t) => {
  const fixture = createFixture(t);
  await assert.rejects(
    deliverDiscord({
      env: discordEnv(fixture),
      maxRetries: 0,
      fetchImpl: async () => mockResponse(500, { message: "Internal error" }),
    }),
    /Discord API request failed \(500\): Internal error/,
  );
});

test("Discord honors Retry-After before retrying", async (t) => {
  const fixture = createFixture(t);
  const delays = [];
  let attempts = 0;
  await deliverDiscord({
    env: discordEnv(fixture),
    maxRetries: 1,
    sleep: async (delay) => delays.push(delay),
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) return mockResponse(429, { retry_after: 1.5 }, { "Retry-After": "1.5" });
      return mockResponse(204, null);
    },
  });

  assert.equal(attempts, 2);
  assert.deepEqual(delays, [1500]);
});

test("Discord reports network timeouts without exposing the webhook URL", async (t) => {
  const fixture = createFixture(t);
  await assert.rejects(
    deliverDiscord({ env: discordEnv(fixture), fetchImpl: timeoutFetch, timeoutMs: 5, maxRetries: 0 }),
    (error) => {
      assert.match(error.message, /Discord request timed out/);
      assert.equal(error.message.includes(DISCORD_WEBHOOK_URL), false);
      return true;
    },
  );
});

test("delivery channels run independently and a configured failure fails the run", async () => {
  const logger = memoryLogger();
  let telegramCalled = false;
  let discordCalled = false;

  await assert.rejects(
    runDeliveries({
      env: {
        TELEGRAM_BOT_TOKEN: TELEGRAM_TOKEN,
        TELEGRAM_CHAT_ID,
        DISCORD_WEBHOOK_URL,
      },
      logger,
      telegramDelivery: async () => {
        telegramCalled = true;
        throw new Error("Telegram unavailable");
      },
      discordDelivery: async () => {
        discordCalled = true;
        return { imagesSent: 0 };
      },
    }),
    /failed for: telegram/,
  );

  assert.equal(telegramCalled, true);
  assert.equal(discordCalled, true);
  assert.match(logger.messages.join("\n"), /\[discord\] Delivery succeeded/);
});

test("orchestrator redacts all credentials from failure logs", async () => {
  const logger = memoryLogger();
  await assert.rejects(runDeliveries({
    env: {
      TELEGRAM_BOT_TOKEN: TELEGRAM_TOKEN,
      TELEGRAM_CHAT_ID,
      DISCORD_WEBHOOK_URL,
    },
    logger,
    telegramDelivery: async () => {
      throw new Error(`failure ${TELEGRAM_TOKEN} ${TELEGRAM_CHAT_ID}`);
    },
    discordDelivery: async () => {
      throw new Error(`failure ${DISCORD_WEBHOOK_URL}`);
    },
  }));

  const output = logger.messages.join("\n");
  assert.equal(output.includes(TELEGRAM_TOKEN), false);
  assert.equal(output.includes(TELEGRAM_CHAT_ID), false);
  assert.equal(output.includes(DISCORD_WEBHOOK_URL), false);
  assert.match(output, /\[REDACTED\]/);
});

test("orchestrator skips unconfigured channels without calling them", async () => {
  let called = false;
  const logger = memoryLogger();
  const results = await runDeliveries({
    env: {},
    logger,
    telegramDelivery: async () => { called = true; },
    discordDelivery: async () => { called = true; },
  });

  assert.equal(called, false);
  assert.deepEqual(results.map((result) => result.status), ["skipped", "skipped"]);
  assert.match(logger.messages.join("\n"), /Delivery skipped/);
});
