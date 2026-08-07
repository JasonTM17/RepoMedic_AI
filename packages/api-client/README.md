# RepoMedic API Client

## Purpose

This package is the frontend-safe contract boundary for the separate API. Its
generated operations are consumed by `apps/web`; API internals must not be
imported into the browser bundle.

## API surface

- `createApiClient` creates a fetch client for an explicit API base URL.
- `listRepairs`, `createRepair`, `getRepair`, and `decideRepairApproval` cover
  the local repair lifecycle.
- Repair proposals include the exact unified-diff hunks, old-file SHA values,
  and candidate digest that the API will apply after approval.

## Env vars

| Name | Required | Default | Description                             |
| ---- | -------: | ------- | --------------------------------------- |
| None |       No | —       | Consumers supply a base URL explicitly. |

## Regeneration

```bash
npm run generate:api-client
```

`docs/openapi.yaml` is the canonical contract. Generated files under
`src/generated` are checked for drift in CI.

## Authentication

The API accepts an optional local bearer token. Consumers that configure one
must pass `Authorization: Bearer <token>` through the generated client headers;
the web app does this only when its public development token is configured.

## Build locally

```bash
npm run build:api-client
```

## Test

```bash
npm test -- packages/api-client/tests
```

## Runbook

Regenerate this package only from the canonical OpenAPI document; do not hand-write request wrappers in the web application.
