# Signal (ATS)

A single-column A4 CV built around the questions a recruiter answers in the first
few seconds. Template ID: `signal-ats`. It is discovered through `meta.json`, like
the other layouts, so it appears in resume-admin's Templates tab after this folder
is pushed to resume-core.

## What the layout answers

| Recruiter question | Where it is answered |
| --- | --- |
| Who is this candidate? | Name, target headline, plain-text contact and profile links |
| Is this person relevant to the role? | Professional Summary, then Core Skills (focused categories) |
| What did they actually do? | Work Experience and Projects: scope line, then evidence bullets |
| Have they grown? | Reverse-chronological roles with right-aligned dates; use one work entry per promotion |
| Is it worth a call? | Short, factual text; links to a live site where one exists |

Skills are connected to evidence: each project prints its own **Tech:** line, so the
tools in Core Skills are visibly used in real work. Evidence notes (problem, contribution,
result, AI use) are drafting inputs for the AI and are never printed.

## ATS safety

- One column, no tables, decorative icons, rating bars, text boxes or remote fonts; the optional
  profile photo stays in the header and never changes the text flow below it.
- Standard section names: Professional Summary, Core Skills, Work Experience,
  Projects, Education, Certifications, References.
- Arial 10pt, selectable text, real hyperlinks, dates in the same entry heading.
- Dates follow the title and organization in the same block flow, so the text
  order stays title, organization, dates.
- The closing declaration is optional and is hidden when `basics.hideDeclaration` is
  true. The target company is included when `basics.targetCompany` is set. The photo
  renders only when `basics.includeProfileImage` and `basics.image` are set.
  References print only when `basics.includeReferences` is true.
- Contact details are in the body, not a page header or footer.

No template guarantees a universal ATS score or that every vendor parses it.

## Working with the AI setup

The template renders the same `resume.json` fields as the other layouts, so the
existing pipeline needs no changes:

- **Project drafts** (`description`, `highlights`) fill the scope line and bullets.
  Write each bullet as action, concrete work, tools, and a result only if it is known.
- **Project Priority** controls order: put the most relevant projects first.
- **Include in generated CV** hides projects without deleting them, per application.
- **Target role / job description** in Basics steer the AI drafts and are not printed.

Select **Signal (ATS)** in Templates, then use **Regenerate PDF**.
