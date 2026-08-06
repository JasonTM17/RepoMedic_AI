# RepoMedic CLI

## Purpose

The CLI provides a scriptable local interface for the same guarded repair workflow used by the API. It will not bypass approval, patch, or command policy.

## API surface

- `repomedic doctor` — validates local CLI availability.
- Repair commands arrive in later phases.

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
