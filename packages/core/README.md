# RepoMedic Core

## Purpose

Core will contain deterministic repair workflow, security policy, tool execution, and model adapter contracts shared by the API and CLI. It must never directly implement a user interface.

## API surface

- Public TypeScript exports from `src/index.ts`.
- Workflow APIs are added in later phases.

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
