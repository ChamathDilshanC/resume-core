# Clarity (ATS)

A single-column A4 CV for fast, evidence-based review. Template ID: `clarity-ats`.
The template is discovered through `meta.json`, like the existing layouts.

## Use it

1. Publish the template and pipeline changes to resume-core and deploy the matching
   resume-admin changes. The dashboard loads templates from GitHub, not this local checkout.
2. In Basics, set an accurate target headline and optionally paste the job description.
   The job description guides all AI drafts but is never printed.
3. In Projects, enter your role, technologies and evidence notes. Use **AI draft
   description & highlights**, review the proposed text, then apply it. GitHub import
   collects the same notes before drafting. Notes survive future pipeline updates.
4. Use **Include in generated CV** to select relevant projects without deleting
   saved projects. This selection is respected by every template and PDF preview.
   Put relevant projects first with Project Priority. Keep work and education in
   reverse chronological order. Use separate work entries for promotions.
5. Choose **Clarity (ATS)** in Templates, then **Save & Regenerate PDF**.

For a local render, set `template` to `clarity-ats` in a *copy* of the resume data
and supply its path through `RESUME_JSON_PATH`. The existing renderer creates the PDF.

## Content structure

- **Name, accurate headline, contact details:** visible text and complete links.
- **Professional Summary:** 2-3 short sentences on background, relevant work and
  strongest demonstrated contributions. A target title does not establish seniority.
- **Technical Skills:** focused categories. Keep interview-defensible skills and
  support key skills in experience/projects. Skill ratings are not printed.
- **Work Experience:** title, company, dates, scope and evidence of delivered work.
  Show responsibility growth, decisions, mentoring or client work when factual.
- **Projects:** system/purpose, optional role/dates/technologies, contribution bullets
  and accessible repository/demo links. Prefer a small, relevant selection.
- **Education and Certifications:** keep relevant qualifications concise.
- **References:** opt in using `basics.includeReferences` when requested.

Photos and the closing declaration are excluded in this template. Other layouts
continue to use their existing settings. All content stays selectable; no layout
tables, columns, remote fonts, icons, rating bars or hidden keywords. Body text is
10.5pt Arial with restrained navy headings, 15mm horizontal / 12mm vertical margins.
Long entries flow across pages instead of forcing tiny type or clipping content.

## Project evidence

Optional fields are backward compatible; old projects render normally:

```json
{
  "role": "Your actual role and team scope",
  "startDate": "YYYY-MM",
  "endDate": "Present",
  "technologies": ["Only technologies actually used"],
  "evidence": {
    "problem": "Who needed the system, and what problem did it address?",
    "contribution": "What did you personally build, debug, test, deploy or decide? How did you use the tools?",
    "result": "A measured result or a delivered capability. Leave unknown results empty.",
    "aiUsage": "Development assistance or an integrated AI feature? What validation actually happened?"
  }
}
```

Evidence notes are drafting inputs, never a second section of the printed CV.
Write bullets as **accurate action + concrete work + relevant tools + supported
result/context**. Not every bullet needs a metric. Do not invent percentages,
users, performance gains, production deployment, leadership or architecture.

Illustrative pattern (replace every bracket with a verified fact):
`Implemented [your change] using [actual tool] to address [documented problem],
resulting in [measured outcome or delivered capability].`
If the last clause is unknown, omit it. Describe AI-assisted testing differently
from integrating an AI feature; only mention evaluation/checks actually performed.

## Automation and validation

`scripts/lib/resume-writing-policy.json` and the matching admin JSON policy are
identical copies because these repositories deploy independently. Keep them in sync.
Both project paths generate `{ description, highlights }`. Work generation still
returns an array. The project merge also accepts legacy array files. Invalid or
empty AI output fails before writing the resume. The workflow reads saved evidence
and target context from its existing `RESUME_JSON_PATH`; no new secret is needed.

Prompts instruct the model to stay grounded; schema validation cannot prove the
truth of an AI claim. Review generated text against your work before applying.
No AI provider calls are needed for the local mocked regression checks.

```powershell
npm test
node scripts/verify-clarity.js
python scripts/verify-clarity-pdf.py <QA-output-directory>
npm --prefix ../resume-admin run build
```

The JS check exercises admin AI requests with a mocked provider, malformed responses,
template discovery/selection/preview, responsive rendering, and real PDF generation
for existing, sparse and long-content data. Use `RESUME_JSON_PATH` for private real
data; QA output goes into OS temp and should not be committed. Inspect rendered PNGs.

## Why these choices

[Greenhouse's parsing guidance](https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse)
identifies graphics, columns, tables, header/footer contact information and unclear
sections as possible parsing problems.
[Harvard's resume guide](https://careerservices.fas.harvard.edu/resources/create-a-strong-resume/)
emphasizes concise, factual, role-relevant content, results and consistent formatting.
These choices improve readability and extraction; no template guarantees a universal
ATS score, successful parsing by every vendor or an interview.
