const fs = require("fs");
const { google } = require("googleapis");

// "<Name> <Label> Resume.pdf" written by generate-pdf.js; the Drive file is
// renamed to this on every upload so the stored file always carries the
// current title.
function readDisplayName(fallback = "resume.pdf") {
  try {
    const name = fs.readFileSync("resume-name.txt", "utf8").trim();
    return name || fallback;
  } catch {
    return fallback;
  }
}

async function main() {
  const fileId = process.env.GDRIVE_FILE_ID;
  const credentialsJson = process.env.GDRIVE_CREDENTIALS;
  const filePath = process.env.GDRIVE_UPLOAD_PATH || "resume.pdf";
  const displayName = readDisplayName();

  if (!fileId) throw new Error("GDRIVE_FILE_ID is required.");
  if (!credentialsJson) throw new Error("GDRIVE_CREDENTIALS is required.");

  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(credentialsJson),
    // drive.file only sees files the app itself created/opened — sharing a
    // file with the service account via the normal Drive UI doesn't count,
    // so files.list/files.update 404 on it despite the ACL grant. The
    // broader "drive" scope respects ordinary ACL sharing instead; it's
    // still limited in practice to whatever's actually been shared with
    // this service account's email.
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  const drive = google.drive({ version: "v3", auth });

  // files.update on an existing fileId overwrites content in place, so the
  // upload counts against the human owner's quota, not the service
  // account's (which is always zero). The file must already exist and be
  // shared with the service account as an Editor — see README.md.
  await drive.files.update({
    fileId,
    resource: { name: displayName },
    media: {
      mimeType: "application/pdf",
      body: fs.createReadStream(filePath),
    },
  });

  console.log(`Uploaded ${filePath} to Google Drive file ${fileId} as "${displayName}".`);
}

main().catch((error) => {
  console.error("upload-to-drive.js failed:", error);
  process.exit(1);
});
