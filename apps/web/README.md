# RepoMedic Web

## Purpose

The web application is a local dashboard for submitting repair runs, reviewing
diagnosis evidence, and making the explicit human approval decision required by
the guarded patch workflow. It uses only the generated
`@jasonTM17/api-client` package and does not import API internals.

## API surface

- `GET /healthz` — local web health route.
- `@jasonTM17/api-client` owns health, repair, list, detail, and approval calls.
- The UI labels its state as local/in-memory; it does not claim persistence,
  authentication, live metrics, or multi-user coordination.

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

Check `/healthz` when diagnosing a dashboard issue, then check the configured
API base URL and the API `/readyz` route. Browser calls require the API's
`CORS_ORIGIN` to include the web origin.
