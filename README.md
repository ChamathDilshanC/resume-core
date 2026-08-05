# resume-core

An event-driven, zero-backend pipeline that keeps a Software Engineering resume
up to date automatically. Pushes to tagged project repositories and GitHub
Issue Form submissions both flow through GitHub Actions, get rewritten into
professional bullet points by an AI step, and are compiled into `resume.pdf`
via Puppeteer — no server, webhook receiver, or database required.

See `architecture.md`, `implementation.md`, and `technologies-used.md` in the
parent folder for the full design rationale.

## Repository layout

```
resume.json                        Single source of truth (JSON Resume standard)
template.html                      Handlebars template for the PDF layout
styles.css                         Print-optimized stylesheet (inlined at render time)
generate-pdf.js                    Compiles template + data and renders resume.pdf via Puppeteer
scripts/
  fetch-repo-data.js               Fetches repo name/description/languages (+ submodules) from GitHub API
  generate-bullets.js              Calls the AI API and returns a JSON array of bullet points
  merge-project.js                 Appends/updates an entry in resume.json's `projects` array
  merge-work.js                    Appends/updates an entry in resume.json's `work` array
  parse-issue.js                   Parses a submitted Issue Form body into fields
.github/workflows/
  update-resume.yml                Flow A: repository_dispatch -> AI -> merge -> PDF -> commit
  update-work-experience.yml       Flow B: issues:opened -> AI -> merge -> PDF -> commit -> close issue
.github/ISSUE_TEMPLATE/
  work-experience.yml              Structured form for manual work experience entries
notifier-template/notify-resume.yml  Template to copy into each tracked project repo
```

## One-time setup

### 1. `resume-core` repository settings
- **Settings -> Actions -> General -> Workflow permissions**: set to
  "Read and write permissions" so `GITHUB_TOKEN` can commit `resume.json` /
  `resume.pdf` back to the repo.
- **Settings -> Secrets and variables -> Actions -> Secrets**, add:
  - `AI_API_KEY` — key for GitHub Models or Google Gemini.
  - `RESUME_CORE_PAT` *(optional)* — only needed if tracked project repos are
    private; used to read their repo/language data.
- **Settings -> Secrets and variables -> Actions -> Variables** *(optional)*,
  override AI provider defaults:
  - `AI_PROVIDER` — `github-models` (default) or `gemini`.
  - `AI_API_URL` — override the chat-completions endpoint.
  - `AI_MODEL` — e.g. `openai/gpt-4o-mini` or `gemini-1.5-flash`.

### 2. Each tracked project repository
- Add the `resume-project` topic to the repo (Settings -> topic tags).
- Copy `notifier-template/notify-resume.yml` to
  `.github/workflows/notify-resume.yml` in that repo.
- Add a `RESUME_CORE_PAT` secret (fine-grained PAT with permission to send
  `repository_dispatch` events to `resume-core`) — this can be an
  Organization secret if every tracked repo shares the same owner.
- Update the `repository:` field in the copied workflow if the resume-core
  repo doesn't live at `ChamathDilshanC/resume-core`.

### 3. Manual work experience entries
- Open a new issue in `resume-core` using the **New Work Experience** form
  (auto-labeled `work-experience`). Submitting it triggers
  `update-work-experience.yml` automatically and closes the issue once done.

## Local development

```bash
npm install
npm run generate        # renders resume.pdf from resume.json + template.html
```

To test the helper scripts locally, set the relevant environment variables
(`GITHUB_TOKEN`, `SOURCE_REPO_OWNER`, `SOURCE_REPO_NAME`, `AI_API_KEY`, etc.)
and run them directly, e.g. `node scripts/fetch-repo-data.js`.

## How data flows

- **Flow A (automated project push):** tracked repo push -> `repository_dispatch`
  -> fetch repo/language data (+ submodules) -> AI bullet points -> merge into
  `resume.json` `projects[]` -> render PDF -> commit & push.
- **Flow B (manual work experience):** Issue Form submission -> parse fields ->
  AI bullet points -> merge into `resume.json` `work[]` -> render PDF -> commit
  & push -> close issue.
