# RepoMedic Core

## Purpose

Core contains the deterministic repair workflow, security policy, tool
execution, and model adapter contracts shared by the API and CLI. It never
directly implements a user interface.

## API surface

- Public TypeScript exports from `src/index.ts`.
- Coordinator, patch-author, reviewer, and bounded-retry workflow APIs.
- Patch application requires an allowlisted, approved operation with exact
  unified-diff hunks; retry rollback uses the exact applied operations.
- A proposal with no operations may complete as a successful `no-op`; a
  non-empty proposal that applies nothing is reported as failed/incomplete.

## Env vars

| Name | Required | Default | Description                                                 |
| ---- | -------: | ------- | ----------------------------------------------------------- |
| None |       No | —       | Core configuration is injected by application entry points. |

## Run locally

```bash
npm run build:core
```

## Test

```bash
npm test -- packages/core/tests
```

## Runbook

Treat core security policy changes as high risk; run focused security tests and a code review before integration.
