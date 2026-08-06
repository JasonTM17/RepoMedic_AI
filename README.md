# RepoMedic

RepoMedic is a local-first AI bug triage and guarded patch assistant. It will safely explore a local Git repository, produce evidence and a repair plan, require explicit approval before changes, run bounded checks, and report the result.

## Documentation
- [Architecture](docs/architecture.md): Overview of the system architecture and modules.
- [Security Model](docs/security.md): Details on how RepoMedic ensures safe execution and file access.

## Local prerequisites

- Node.js 22 or newer
- npm 10 or newer
- Docker Desktop for later Compose validation

## Quick Start

```bash
npm install
npm run build
npm test
```

## Usage

You can use the CLI to start the triage process on a repository:

```bash
node apps/cli/dist/index.js triage <path>
```

## Service boundaries

- `apps/api`: Express REST API.
- `apps/web`: Next.js local dashboard that will consume the generated OpenAPI client.
- `apps/cli`: Commander CLI.
- `packages/core`: deterministic repair and security logic.
- `packages/api-client`: generated API client boundary.

See `docs/adr/0001-separate-api-and-web-services.md` for the initial architectural decision.
