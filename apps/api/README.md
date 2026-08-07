# RepoMedic API

## Purpose

The API currently provides local health, readiness, and metrics endpoints. It
will expose the guarded repair workflow to the dashboard and trusted local
clients after the repair endpoints are implemented; it does not embed frontend
behavior.

## API surface

- `GET /healthz` — liveness.
- `GET /readyz` — readiness.
- `GET /metrics` — Prometheus-compatible metrics.
- Repair endpoints are not implemented in the current scope; their contract
  source is `docs/openapi.yaml`.

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
