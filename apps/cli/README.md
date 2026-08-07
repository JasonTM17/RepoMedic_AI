# RepoMedic CLI

## Purpose

The CLI provides the scriptable local interface for RepoMedic's guarded repair
workflow. The API currently exposes health/readiness scaffolding and does not
yet expose this repair flow. The CLI will not bypass approval, patch, or
command policy.

## API surface

- `repomedic doctor` — validates local CLI availability.
- `repomedic triage <repo-path>` — runs the explorer, requests human approval
  for the resulting patch proposal, then applies it through the bounded
  retry pipeline (`packages/core` patch author + reviewer agents). Exits
  non-zero if the patch pipeline reports `failed`, `reverted`, or
  `revert-failed`; exits `0` on `applied`, on an intentional empty-proposal
  `no-op`, on no issues found, on approval rejection, and in `--dry-run`.
  - `--dry-run` — plan only; never invokes the patch pipeline.
  - `--model <backend>` — `fake` (default) or `openai`.
  - `--allowlist <paths>` — comma-separated path allowlist relative to the repo root. The default `.` covers the repository except traversal and protected paths.
  - `--max-retries <n>` — positive integer; forwarded to the bounded retry
    pipeline as the attempt cap (default `3`).
  - `--issue <description>` — issue description passed to the explorer.

## Env vars

| Name                     | Required | Default           | Description                     |
| ------------------------ | -------: | ----------------- | ------------------------------- |
| `REPOMEDIC_ALLOWED_ROOT` |       No | Current directory | Allowed target-repository root. |

## Run locally

```bash
npm run repomedic -- --help
npm run repomedic -- doctor
```

## Test

```bash
npm test -- apps/cli/tests
```

## Runbook

Run `repomedic doctor` before diagnosing a local CLI issue. Do not place credentials in command arguments or shell history.
