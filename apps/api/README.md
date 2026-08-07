# RepoMedic API

## Purpose

The API provides the local health, readiness, metrics, diagnosis, evidence
review, approval, and guarded patch workflow. It does not embed frontend
behavior and does not allow a request to select an arbitrary filesystem root.

## API surface

- `GET /healthz` — liveness.
- `GET /readyz` — readiness.
- `GET /metrics` — Prometheus-compatible metrics.
- `POST /v1/repairs` — diagnose the configured repository and create a run.
- `GET /v1/repairs` — list in-memory runs.
- `GET /v1/repairs/:repairId` — inspect evidence and proposal details.
- `POST /v1/repairs/:repairId/approval` — approve or reject a proposal. An
  approval invokes the bounded retry workflow; rejection never mutates files.

The canonical contract is `docs/openapi.yaml`; the generated TypeScript client
is published from `packages/api-client`.

## Env vars

| Name                     | Required | Default                                              | Description                                               |
| ------------------------ | -------: | ---------------------------------------------------- | --------------------------------------------------------- |
| `HOST`                   |       No | `0.0.0.0`                                            | Bind address.                                             |
| `PORT`                   |       No | `4000`                                               | HTTP port.                                                |
| `REPOMEDIC_REPO_ROOT`    |       No | First repository ancestor from the current directory | Repository root the API is allowed to inspect and mutate. |
| `CORS_ORIGIN`            |       No | `http://localhost:3000`                              | Comma-separated browser origins allowed to call the API.  |
| `REPOMEDIC_OPENAI_MODEL` |       No | Core default                                         | OpenAI model name when the `openai` backend is selected.  |

## Run locally

```bash
npm run dev:api
```

## Test

```bash
npm test -- apps/api/tests
```

## Runbook

Use `/healthz` for liveness and `/readyz` for readiness. Restarting the local API
discards in-memory repair runs. Authentication, durable persistence, and a
multi-user deployment boundary are intentionally outside this local-first
workflow.
