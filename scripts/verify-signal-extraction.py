"""Compare production-oriented Signal PDF extraction with PyMuPDF, pdfplumber, and pypdf.

Usage: python scripts/verify-signal-extraction.py <signal.pdf> [source.json]
"""
import json
import re
import sys
from pathlib import Path


def normalize(text):
    return re.sub(r"\s+", " ", text).strip().casefold()


pdf_path = Path(sys.argv[1]).resolve()
if not pdf_path.is_file():
    raise SystemExit(f"PDF not found: {pdf_path}")

import fitz

doc = fitz.open(pdf_path)
mupdf_text = "\n".join(page.get_text("text", sort=True) for page in doc)
assert len(doc) == 2, f"expected 2 pages, got {len(doc)}"

try:
    import pdfplumber
    with pdfplumber.open(pdf_path) as pdf:
        plumber_text = "\n".join(page.extract_text() or "" for page in pdf.pages)
except ImportError:
    raise SystemExit("pdfplumber is required for independent extraction verification")

from pypdf import PdfReader
reader = PdfReader(pdf_path)
pypdf_text = "\n".join(page.extract_text() or "" for page in reader.pages)

extractors = {
    "PyMuPDF": mupdf_text,
    "pdfplumber": plumber_text,
    "pypdf": pypdf_text,
}

normalized = {name: normalize(text) for name, text in extractors.items()}
for name, text in normalized.items():
    for required in (
        "CHAMATH DILSHAN",
        "PROFESSIONAL SUMMARY",
        "TECHNICAL SKILLS",
        "WORK EXPERIENCE",
        "PROJECTS",
        "EDUCATION",
        "CERTIFICATIONS",
        "chamathdilshan.dev@gmail.com",
        "+94 775 616 104",
    ):
        assert required.casefold() in text, f"{name}: missing {required}"
    assert "teraform" not in text
    assert " | " not in text

reference = normalized["PyMuPDF"]
for name, text in normalized.items():
    if text != reference:
        head = min(len(reference), len(text))
        mismatch = next((i for i in range(head) if reference[i] != text[i]), head)
        raise AssertionError(f"{name} differs from PyMuPDF near character {mismatch}")

if len(sys.argv) > 2:
    source = json.loads(Path(sys.argv[2]).read_text(encoding="utf-8"))
    rendered_projects = source.get("projects", [])[:3]
    for project in rendered_projects:
        if project.get("includeInResume") is not False:
            assert normalize(project["name"]) in reference
    for skill in source.get("skills", []):
        for keyword in skill.get("keywords", []):
            rendered_keyword = {"Teraform": "Terraform", "Superbase": "Supabase"}.get(keyword, keyword)
            assert normalize(rendered_keyword) in reference, f"missing source skill: {keyword}"

print(f"PASS: {pdf_path.name}: 2 pages; PyMuPDF, pdfplumber, and pypdf agree; no separator spans or Teraform")
