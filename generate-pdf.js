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

// Inline SVG icon set (sourced from react-icons: Feather for the outline
// glyphs, Font Awesome brand marks for LinkedIn/GitHub) for templates that
// render icon-labeled contact rows. Falls back to a globe for any profile
// network without a dedicated icon (e.g. a future Twitter/X profile).
const ICONS = {
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  linkedin: '<svg viewBox="0 0 448 512" fill="#0A66C2"><path d="M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3zM135.4 416H69V202.2h66.5V416zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96c21.2 0 38.5 17.3 38.5 38.5 0 21.3-17.2 38.5-38.5 38.5zm282.1 243h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9V416z"/></svg>',
  github: '<svg viewBox="0 0 496 512" fill="#181717"><path d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"/></svg>',
};

Handlebars.registerHelper("icon", function (name) {
  const key = String(name || "").trim().toLowerCase();
  return new Handlebars.SafeString(ICONS[key] || ICONS.globe);
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
