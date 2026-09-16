"""Inspect output from verify-apex.js; requires PyMuPDF (pip install pymupdf).

Usage: python scripts/verify-apex-pdf.py <QA output directory>
Writes selectable text and page PNGs beside the PDFs for manual visual review.
"""
import json
import re
import sys
from pathlib import Path

import fitz


def normalize(text):
    return re.sub(r"\s+", "", text).casefold()


output = Path(sys.argv[1]).resolve()
for name in ("apex-ats", "sparse", "stress"):
    data = json.loads((output / f"{name}.json").read_text(encoding="utf-8"))
    document = fitz.open(output / f"{name}.pdf")
    texts = [page.get_text(sort=False) for page in document]
    text = "\n\f\n".join(texts)
    (output / f"{name}.txt").write_text(text, encoding="utf-8")
    normalized = normalize(text)
    assert "\ufffd" not in text, f"{name}: replacement glyph"
    assert normalize(data["basics"]["name"]) in normalized
    headings = []
    if data["basics"].get("summary"):
        headings.append("Professional Summary")
    for key, title in (("skills", "Technical Skills"), ("work", "Work Experience"),
                       ("projects", "Projects"), ("education", "Education"),
                       ("certificates", "Certifications"), ("references", "References")):
        if data.get(key):
            headings.append(title)
    positions = [re.search(r"^" + re.escape(title) + r"$", text, re.I | re.M).start() for title in headings]
    assert positions == sorted(positions), f"{name}: section extraction order"
    for key in ("work", "projects"):
        cursor = 0
        for entry in data.get(key, []):
            fields = ("position", "name") if key == "work" else ("name", "description")
            for field in fields:
                if entry.get(field):
                    cursor = normalized.index(normalize(entry[field]), cursor) + len(normalize(entry[field]))
            for bullet in entry.get("highlights", []):
                cursor = normalized.index(normalize(bullet), cursor) + len(normalize(bullet))
    for skill in data.get("skills", []):
        for keyword in skill.get("keywords", []):
            assert normalize(keyword) in normalized, f"{name}: missing skill"
    for project in data.get("projects", []):
        for link in project.get("links", []):
            url = re.sub(r"^https?://", "", link["url"]).rstrip("/")
            assert normalize(url) in normalized, f"{name}: missing URL"
    for page_number, page in enumerate(document, 1):
        words = page.get_text("words")
        assert words, f"{name}: blank page {page_number}"
        assert abs(page.rect.width - 595.28) < 1 and abs(page.rect.height - 841.89) < 1
        # Tolerance includes font ascenders extending slightly above line boxes.
        assert all(41 <= w[0] < w[2] <= page.rect.width - 41 and
                   32 <= w[1] < w[3] <= page.rect.height - 32 for w in words), \
            f"{name}: content outside print margins on page {page_number}"
        page_lines = [line.strip() for line in texts[page_number - 1].splitlines() if line.strip()]
        assert page_lines[-1].casefold() not in [h.casefold() for h in headings], \
            f"{name}: stranded section heading"
        page.get_pixmap(matrix=fitz.Matrix(1.25, 1.25)).save(output / f"{name}-page-{page_number}.png")
    urls = [link.get("uri") for page in document for link in page.get_links()]
    if data["basics"].get("email"):
        assert "mailto:" + data["basics"]["email"] in urls, "Email link lost"
    print(f"PASS: {name}: {len(document)} A4 pages; text, reading order, margins, links; PNGs rendered")
