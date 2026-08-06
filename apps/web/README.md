# RepoMedic Web

## Purpose

The web application is the local dashboard for submitting repair runs, reviewing evidence, approving patches, and viewing reports. It calls the separate API through generated client code only.

## API surface

- `GET /healthz` — local web health route.
- The generated `@jasonTM17/api-client` package will own repair API calls in a later phase.

## Env vars

| Name                            | Required | Default                 | Description   |
| ------------------------------- | -------: | ----------------------- | ------------- |
| `NEXT_PUBLIC_REPOMEDIC_API_URL` |       No | `http://localhost:4000` | API base URL. |

## Run locally

```bash
npm run dev:web
```

## Test

```bash
npm test -- apps/web/tests
```

## Runbook

Check `/healthz` when diagnosing a dashboard issue. Validate API health separately before investigating client connectivity.
