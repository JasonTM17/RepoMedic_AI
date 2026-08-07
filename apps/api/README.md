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
- `GET /v1/repairs` — list durable local runs.
- `GET /v1/repairs/:repairId` — inspect evidence and proposal details.
- `POST /v1/repairs/:repairId/approval` — approve or reject a proposal. An
  approval invokes the bounded retry workflow; rejection never mutates files.

The canonical contract is `docs/openapi.yaml`; the generated TypeScript client
is published from `packages/api-client`.

## Env vars

| Name                     | Required | Default                                              | Description                                               |
| ------------------------ | -------: | ---------------------------------------------------- | --------------------------------------------------------- |
| `HOST`                   |       No | `127.0.0.1`                                          | Bind address; Compose overrides this for the container.   |
| `PORT`                   |       No | `4000`                                               | HTTP port.                                                |
| `REPOMEDIC_REPO_ROOT`    |       No | First repository ancestor from the current directory | Repository root the API is allowed to inspect and mutate. |
| `CORS_ORIGIN`            |       No | `http://localhost:3000`                              | Comma-separated browser origins allowed to call the API.  |
| `REPOMEDIC_DATA_DIR`     |       No | `<repository-root>/.repomedic`                       | Directory for the atomic local repair-run store.          |
| `REPOMEDIC_API_TOKEN`    |       No | unset                                                | Bearer token required for `/v1/*` when configured.        |
| `REPOMEDIC_OPENAI_MODEL` |       No | Core default                                         | OpenAI model name when the `openai` backend is selected.  |

## Run locally

```bash
npm run dev:api
```

With Compose, the API root is `/workspace/repository`, backed by the current
checkout as a read-write bind mount. This makes the container target the actual
repository; it is not a generic remote multi-tenant service.

For a second local stack, use `docker-compose.local.yml`; it publishes the API
on `http://localhost:4400`, the dashboard on `http://localhost:4300`, and
builds the browser client with the matching API URL.

## Test

```bash
npm test -- apps/api/tests
```

## Runbook

Use `/healthz` for liveness and `/readyz` for readiness. Repair evidence is
stored atomically in `repair-runs.v1.json` under `REPOMEDIC_DATA_DIR`; runs that
were `diagnosing` or `running` during a restart are recovered as
`recovery-required`, which blocks automatic continuation or mutation until an
operator inspects the worktree. The store uses an exclusive lock and merges
independent process snapshots; a stale lock can be recovered safely. Invalid
state is quarantined instead of overwritten, `/readyz` returns `503`, and
mutations remain blocked until the operator inspects the quarantine file.
Authentication and a multi-user deployment boundary remain outside this
local-first workflow. Set `REPOMEDIC_API_TOKEN` when the API is reachable by
another trusted process; health and readiness endpoints remain public for
container healthchecks.
