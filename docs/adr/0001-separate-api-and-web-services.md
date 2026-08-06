# 1. Separate API and web services

Date: 2026-08-06

## Status

Accepted

## Context

RepoMedic began as a CLI-oriented MVP, but the approved delivery scope requires a real separate API and web service baseline. The frontend must not use Next.js API routes as its production backend.

## Decision

Use an Express API in `apps/api` and a Next.js App Router dashboard in `apps/web`. The web will consume only a generated TypeScript client from the canonical `docs/openapi.yaml` contract. The CLI and API share deterministic repair behavior through `packages/core`.

## Consequences

### Positive

- UI and backend deploy independently with smaller blast radius.
- OpenAPI prevents hand-written client drift.
- The CLI remains a first-class local interface.

### Negative

- The initial bootstrap includes an additional service and container.
- Contract generation becomes a required build/CI concern.

### Neutral

- Docker Hub publishing workflows are prepared for a future `main` branch release but are not invoked by this local bootstrap or without separately configured repository secrets.

## Alternatives considered

- A monolithic Next.js application was rejected because it conflicts with the required backend/frontend separation.
- No web service was rejected because the approved scope explicitly selects a full-service baseline.

## References

- `docs/openapi.yaml`
