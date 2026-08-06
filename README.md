# RepoMedic

RepoMedic is a local-first AI bug triage and guarded patch assistant. It will safely explore a local Git repository, produce evidence and a repair plan, require explicit approval before changes, run bounded checks, and report the result.

## Status

Phase 1 establishes the separate API, web, CLI, and shared-core boundaries. Guarded repository access, model routing, repair workflows, and fixture evaluations arrive in later phases.

## Local prerequisites

- Node.js 22 or newer
- npm 10 or newer
- Docker Desktop for later Compose validation

## Commands

```bash
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run repomedic -- --help
```

## Service boundaries

- `apps/api`: Express REST API.
- `apps/web`: Next.js local dashboard that will consume the generated OpenAPI client.
- `apps/cli`: Commander CLI.
- `packages/core`: deterministic repair and security logic.
- `packages/api-client`: generated API client boundary.

See `docs/adr/0001-separate-api-and-web-services.md` for the initial architectural decision.
