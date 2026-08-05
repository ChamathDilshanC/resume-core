const fs = require("fs-extra");
const path = require("path");
const Handlebars = require("handlebars");
const puppeteer = require("puppeteer");

const ROOT = __dirname;
const RESUME_JSON_PATH = path.join(ROOT, "resume.json");
const TEMPLATE_PATH = path.join(ROOT, "template.html");
const STYLES_PATH = path.join(ROOT, "styles.css");
const OUTPUT_PDF_PATH = path.join(ROOT, "resume.pdf");

Handlebars.registerHelper("joinList", function (list) {
  if (!Array.isArray(list)) return "";
  return list.join(", ");
});

Handlebars.registerHelper("dateRange", function (startDate, endDate) {
  const start = (startDate || "").trim();
  const end = (endDate || "").trim();
  if (!start && !end) return "";
  if (start && end) return `${start} - ${end}`;
  return start || end;
});

Handlebars.registerHelper("stripProtocol", function (url) {
  return (url || "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
});

Handlebars.registerHelper("gt", function (a, b) {
  return a > b;
});

async function generateResumePdf() {
  const resumeData = await fs.readJson(RESUME_JSON_PATH);
  const templateSource = await fs.readFile(TEMPLATE_PATH, "utf8");
  const stylesSource = await fs.readFile(STYLES_PATH, "utf8");

  const template = Handlebars.compile(templateSource);
  const html = template({ ...resumeData, styles: stylesSource });

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

  console.log(`Resume PDF generated at ${OUTPUT_PDF_PATH}`);
}

generateResumePdf().catch((error) => {
  console.error("Failed to generate resume PDF:", error);
  process.exit(1);
});
