# RepoMedic Web

## Purpose

The web application is a local dashboard scaffold. Its repair-run submission,
evidence review, approval, and report views are deferred until the separate
API and generated client surfaces are implemented.

## API surface

- `GET /healthz` — local web health route.
- The generated `@jasonTM17/api-client` package will own repair API calls when
  those API endpoints are implemented.

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
