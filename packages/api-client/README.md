# RepoMedic API Client

## Purpose

This package is the frontend-safe contract boundary for the separate API. It will be generated from `docs/openapi.yaml` and consumed by `apps/web`.

## API surface

- `createApiClientConfiguration` is the temporary bootstrap export.
- Generated repair client operations arrive after the OpenAPI contract expands.

## Env vars

| Name | Required | Default | Description                             |
| ---- | -------: | ------- | --------------------------------------- |
| None |       No | —       | Consumers supply a base URL explicitly. |

## Run locally

```bash
npm run build:api-client
```

## Test

```bash
npm test -- packages/api-client/tests
```

## Runbook

Regenerate this package only from the canonical OpenAPI document; do not hand-write request wrappers in the web application.
