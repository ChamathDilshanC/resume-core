const fs = require("fs-extra");
const path = require("path");
const Handlebars = require("handlebars");
const puppeteer = require("puppeteer");

const ROOT = __dirname;
const RESUME_JSON_PATH = process.env.RESUME_JSON_PATH || path.join(ROOT, "data", "resume.json");
const TEMPLATES_DIR = path.join(ROOT, "templates");
const DEFAULT_TEMPLATE = "default";
const OUTPUT_PDF_PATH = path.join(ROOT, "resume.pdf");
const OUTPUT_NAME_PATH = path.join(ROOT, "resume-name.txt");

Handlebars.registerHelper("joinList", function (list) {
  if (!Array.isArray(list)) return "";
  return list.join(", ");
});

// ATS-friendly date formatting: "2026-01" -> "Jan 2026", "2026-01-01" -> "Jan 2026", "2026" -> "2026".
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDateString(value) {
  const trimmed = (value || "").trim();
  const fullDate = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (fullDate) {
    const monthIndex = Number(fullDate[2]) - 1;
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${MONTH_NAMES[monthIndex]} ${fullDate[1]}`;
    }
  }
  const monthYear = trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (monthYear) {
    const monthIndex = Number(monthYear[2]) - 1;
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${MONTH_NAMES[monthIndex]} ${monthYear[1]}`;
    }
  }
  const yearOnly = trimmed.match(/^(\d{4})$/);
  if (yearOnly) return yearOnly[1];
  return trimmed;
}

Handlebars.registerHelper("dateRange", function (startDate, endDate) {
  const start = formatDateString(startDate);
  const end = formatDateString(endDate);
  if (!start && !end) return "";
  if (start && end) return `${start} - ${end}`;
  return start || end;
});

Handlebars.registerHelper("stripProtocol", function (url) {
  return (url || "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
});

// ATS wants "City, Country" spelled out, but resume.json stores ISO codes.
const COUNTRY_NAMES = {
  LK: "Sri Lanka",
  US: "United States",
  GB: "United Kingdom",
  IN: "India",
  AU: "Australia",
  CA: "Canada",
  DE: "Germany",
  SG: "Singapore",
};

Handlebars.registerHelper("countryName", function (code) {
  const upper = String(code || "").toUpperCase();
  return COUNTRY_NAMES[upper] || code || "";
});

Handlebars.registerHelper("gt", function (a, b) {
  return a > b;
});

const IMAGE_MIME_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

async function resolveImageToDataUri(imagePath) {
  if (!imagePath || /^(https?:)?\/\//i.test(imagePath) || imagePath.startsWith("data:")) {
    return imagePath;
  }

  const absolutePath = path.join(ROOT, imagePath);
  const mimeType = IMAGE_MIME_TYPES[path.extname(absolutePath).toLowerCase()] || "image/png";
  const buffer = await fs.readFile(absolutePath);
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

// Human-facing filename used by the delivery channels (Drive, email,
// WhatsApp): "<Name> <Label> Resume.pdf", e.g. "Chamath Dilshan Intern
// DevOps Resume.pdf". The repo keeps the stable resume.pdf; the display
// name travels alongside it in resume-name.txt.
function pdfDisplayName(resumeData) {
  const basics = resumeData.basics || {};
  const name = String(basics.name || "")
    .trim()
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
  const label = String(basics.label || "").trim();
  const raw = [name, label, "Resume"].filter(Boolean).join(" ");
  const safe = raw.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
  return safe ? `${safe}.pdf` : "resume.pdf";
}

async function generateResumePdf() {
  const resumeData = await fs.readJson(RESUME_JSON_PATH);

  const templateName = resumeData.template || process.env.RESUME_TEMPLATE || DEFAULT_TEMPLATE;
  const templateDir = path.join(TEMPLATES_DIR, templateName);
  if (!(await fs.pathExists(path.join(templateDir, "template.html")))) {
    throw new Error(`Unknown template "${templateName}" — no templates/${templateName}/template.html found.`);
  }
  const templateSource = await fs.readFile(path.join(templateDir, "template.html"), "utf8");
  const stylesSource = await fs.readFile(path.join(templateDir, "styles.css"), "utf8");

  resumeData.basics.image = await resolveImageToDataUri(resumeData.basics.image);

  const template = Handlebars.compile(templateSource);
  const html = template(resumeData).replace(
    /<!--\s*INLINE_STYLES\s*-->/,
    () => `<style>${stylesSource}</style>`
  );

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: OUTPUT_PDF_PATH,
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "15mm", right: "15mm" },
    });
  } finally {
    await browser.close();
  }

  const displayName = pdfDisplayName(resumeData);
  await fs.writeFile(OUTPUT_NAME_PATH, displayName, "utf8");

  console.log(`Resume PDF generated at ${OUTPUT_PDF_PATH} (display name: ${displayName})`);
}

generateResumePdf().catch((error) => {
  console.error("Failed to generate resume PDF:", error);
  process.exit(1);
});
