# RepoMedic API

## Purpose

The API exposes the local repair workflow to the dashboard and other trusted local clients. It will call `@repomedic/core`; it does not embed frontend behavior.

## API surface

- `GET /healthz` — liveness.
- `GET /readyz` — readiness.
- `GET /metrics` — Prometheus-compatible metrics.
- Repair endpoints will be added from `docs/openapi.yaml` in later phases.

## Env vars

| Name   | Required | Default   | Description   |
| ------ | -------: | --------- | ------------- |
| `HOST` |       No | `0.0.0.0` | Bind address. |
| `PORT` |       No | `4000`    | HTTP port.    |

## Run locally

```bash
npm run dev:api
```

## Test

```bash
npm test -- apps/api/tests
```

## Runbook

Use `/healthz` for liveness and `/readyz` for readiness. Restarting the local API will discard in-memory repair runs until a later persistence phase introduces safe storage.
