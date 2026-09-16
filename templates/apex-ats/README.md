# Apex (ATS)

Premium single-column A4 template using the existing `template.html`,
`styles.css`, `meta.json` discovery contract and `INLINE_STYLES` hook. No new
helpers, schema fields, runtime dependencies, remote fonts, or dashboard changes.

The visible name is **Apex (ATS)**; the stored template ID is `apex-ats`.
The admin reads templates from the configured GitHub resume-core repository,
not the local checkout. Once these files are published there, refresh Templates,
choose **Use this template**, then **Save & Regenerate PDF**. That workflow uses
the existing generator with `resume.json.template`. No workflow changes are needed.

## Design and content

- Arial/Helvetica/sans-serif, 26pt name, 10pt body, restrained blue headings.
- A4 with 12mm vertical and 15mm horizontal margins; matching screen measure.
- DOM and visual order: name, headline, contacts, summary, skills, experience,
  projects, education, certifications, references, optional existing declaration.
- Real selectable text, semantic headings/lists, visible clickable URLs. No photo,
  icons, layout tables, columns, positioned content, or generated text.
- Work summaries and education scores/courses are preserved. The existing project
  schema has no dedicated stack, date, or role field; descriptions and highlights
  carry that information without inventing fields.
- Missing optional values and empty arrays are omitted; dates support either end.
- Heading chains stay with opening content. Link groups, skill rows, and ordinary
  bullets stay together; long entries can span pages without atomic section gaps.
- The existing `hideDeclaration` and `targetCompany` behavior is respected.

## Local verification (PowerShell, from resume-core)

Requires installed core and sibling resume-admin dependencies. PDF inspection
uses optional local Python tooling (`python -m pip install pymupdf`); it is not a
pipeline dependency. The core package has no build/typecheck/lint script.

```powershell
npm test
$env:RESUME_JSON_PATH = (Resolve-Path '../resume-data/resume.json').Path
node scripts/verify-apex.js
# Use the QA output directory printed above:
python scripts/verify-apex-pdf.py 'C:/path/to/apex-qa-XXXXXX'
npm --prefix ../resume-admin run build
```

The JS check runs the actual generator in an isolated temporary copy for Apex,
Default, Iconic, Ultra, sparse data, and a long-content stress fixture. It never
replaces your existing PDF or edits private resume data. It checks the real admin
discovery/fetch functions against a local GitHub content transport, renders the
real preview helper, invokes the Templates component's selection callback, and
checks 794px/375px widths and zero Apex network requests.

The Python check extracts actual PDF text, checks section/entry/bullet reading
order, skills and URLs, A4 bounds, print margins, blank pages, orphaned section
headings, and email annotations. It exports every page to PNG for visual review.
Review these images after CSS changes; automated checks cannot judge typography.
Temporary output contains private data when real data is supplied: do not commit it.

Validated with the current full resume: four pages, all pages visually reviewed
after a pagination refinement pass. Sparse fixture: one page; stress fixture:
six pages. Existing templates also generated successfully. This validates text
extraction, not a guarantee of every third-party ATS parser's behavior.

Live GitHub authentication, deployed discovery, workflow dispatch, and downstream
delivery require publication and were not executed by the local verification.
The admin production build passes with existing Handlebars webpack warnings;
its standalone lint command prompts for initial ESLint configuration.
