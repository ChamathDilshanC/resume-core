# JobMail tailored CV workflow

## Trigger contract

The workflow is dispatched by DevResume Admin with these inputs:

| Input | Required | Purpose |
| --- | :---: | --- |
| `request_id` | yes | Opaque correlation ID used in the run and artifact name |
| `target_role` | yes | Role or headline used for the tailored document |
| `target_company` | no | Company context for the application |
| `job_description` | no | Optional bounded posting context |

The workflow is not triggered by `pull_request` or repository pushes. It runs
with `contents: read`, checks out `resume-data` using `RESUME_DATA_PAT`, and
uploads only a short-lived artifact.

## Rendering behavior

`generate-pdf.js` reads the private source JSON from `RESUME_JSON_PATH`. When
the JobMail environment variables are present, it creates an in-memory view
with:

- `basics.label` replaced by `TARGET_ROLE`;
- `basics.targetCompany` set from `TARGET_COMPANY`; and
- `basics.jobDescription` set from `JOB_DESCRIPTION`.

The source file on disk is never rewritten. The generated `resume.pdf` and
`resume-name.txt` are uploaded as `jobmail-resume-<request_id>` with one-day
retention. The normal Drive, SMTP, Telegram, and Discord delivery steps are
not called by this workflow.

## Security checklist

- Keep `RESUME_DATA_PAT` in GitHub Actions secrets and scope it only to the
  private `resume-data` repository with the minimum contents permissions.
- Do not print input values, private resume JSON, or PDF bytes in workflow logs.
- Keep the workflow `contents: read`; the tailored path has no write permission
  to `resume-core` or `resume-data`.
- Preserve the artifact retention limit and request-specific artifact name so
  the DevResume Admin bridge cannot retrieve another request's output.
- Treat role/company/job-description inputs as untrusted text; the workflow
  passes them as environment values and does not execute them as shell code.
