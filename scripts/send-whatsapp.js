const fs = require("fs");

const GRAPH_API_VERSION = "v21.0";
const TEMPLATE_NAME = process.env.WHATSAPP_TEMPLATE_NAME || "resume_pdf_update";
const TEMPLATE_LANGUAGE = process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en_US";

// "<Name> <Label> Resume.pdf" written by generate-pdf.js; used as the media
// filename so the document arrives under the current title.
function readDisplayName(fallback = "resume.pdf") {
  try {
    const name = fs.readFileSync("resume-name.txt", "utf8").trim();
    return name || fallback;
  } catch {
    return fallback;
  }
}

async function uploadMedia(phoneNumberId, token, filePath, displayName) {
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", new Blob([fs.readFileSync(filePath)], { type: "application/pdf" }), displayName);

  const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`WhatsApp media upload failed (${response.status}): ${await response.text()}`);
  }

  const data = await response.json();
  return data.id;
}

// A plain "document" message only delivers within 24h of the recipient's
// last message to the business number (WhatsApp's session-message rule) —
// useless for an unattended pipeline run. A pre-approved template message
// bypasses that window, which is the whole point of templates.
async function sendTemplateDocument(phoneNumberId, token, recipient, mediaId, displayName) {
  const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: recipient,
      type: "template",
      template: {
        name: TEMPLATE_NAME,
        language: { code: TEMPLATE_LANGUAGE },
        components: [
          {
            type: "header",
            parameters: [{ type: "document", document: { id: mediaId, filename: displayName } }],
          },
        ],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`WhatsApp send message failed (${response.status}): ${await response.text()}`);
  }
}

async function main() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const recipient = process.env.RECIPIENT_PHONE_NUMBER;
  const filePath = process.env.WHATSAPP_UPLOAD_PATH || "resume.pdf";
  const displayName = readDisplayName();

  if (!token) throw new Error("WHATSAPP_TOKEN is required.");
  if (!phoneNumberId) throw new Error("WHATSAPP_PHONE_NUMBER_ID is required.");
  if (!recipient) throw new Error("RECIPIENT_PHONE_NUMBER is required.");

  const mediaId = await uploadMedia(phoneNumberId, token, filePath, displayName);
  await sendTemplateDocument(phoneNumberId, token, recipient, mediaId, displayName);

  console.log(`Sent ${displayName} to WhatsApp ${recipient} (media id ${mediaId}).`);
}

main().catch((error) => {
  console.error("send-whatsapp.js failed:", error);
  process.exit(1);
});
