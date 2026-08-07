const fs = require("fs");
const { google } = require("googleapis");

async function main() {
  const fileId = process.env.GDRIVE_FILE_ID;
  const credentialsJson = process.env.GDRIVE_CREDENTIALS;
  const filePath = process.env.GDRIVE_UPLOAD_PATH || "resume.pdf";

  if (!fileId) throw new Error("GDRIVE_FILE_ID is required.");
  if (!credentialsJson) throw new Error("GDRIVE_CREDENTIALS is required.");

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credentialsJson),
    // drive.file: only touches files the service account created or that
    // were explicitly shared with it — never broader Drive access.
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });

  const drive = google.drive({ version: "v3", auth });

  // files.update on an existing fileId overwrites content in place, so the
  // upload counts against the human owner's quota, not the service
  // account's (which is always zero). The file must already exist and be
  // shared with the service account as an Editor — see README.md.
  await drive.files.update({
    fileId,
    media: {
      mimeType: "application/pdf",
      body: fs.createReadStream(filePath),
    },
  });

  console.log(`Uploaded ${filePath} to Google Drive file ${fileId}.`);
}

main().catch((error) => {
  console.error("upload-to-drive.js failed:", error);
  process.exit(1);
});
