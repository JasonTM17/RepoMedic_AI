# RepoMedic AI

<p align="center">
  <img src="docs/images/cover.jpg" alt="RepoMedic AI Cover Image" width="100%">
</p>

<div align="center">

[![CI](https://github.com/JasonTM17/RepoMedic_AI/actions/workflows/ci.yml/badge.svg)](https://github.com/JasonTM17/RepoMedic_AI/actions/workflows/ci.yml)
[![Docker](https://img.shields.io/docker/v/nguyenson1710/repomedic-api?label=docker&sort=semver)](https://hub.docker.com/r/nguyenson1710/repomedic-api)
[![npm](https://img.shields.io/npm/v/@jasonTM17/core?label=@jasonTM17/core)](https://github.com/JasonTM17/RepoMedic_AI/pkgs/npm/%40jasonTM17%2Fcore)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Local-first AI bug triage and guarded patch assistant**

[Features](#features) • [Quick Start](#quick-start) • [Usage](#usage) • [Architecture](#architecture) • [Development](#development) • [Contributing](#contributing)

</div>

---

## Features

- **AI-Powered Triage**: Automatically diagnose and triage bugs in your repository
- **Guarded Patch Application**: Apply patches only after human approval
- **Security-First Design**: Path allowlisting, mutation policies, and bounded execution
- **Multi-Platform Support**: Works on Windows, macOS, and Linux
- **CLI & Web Interface**: Use via command line or web dashboard

## Quick Start

### Prerequisites

- Node.js 22 or newer
- npm 10 or newer
- Docker Desktop (for containerized deployment)

### Installation

```bash
# Clone the repository
git clone https://github.com/JasonTM17/RepoMedic_AI.git
cd RepoMedic_AI

# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test
```

### Docker Deployment

```bash
# Pull and run with Docker Compose
docker compose up -d

# Or pull images individually
docker pull nguyenson1710/repomedic-api:latest
docker pull nguyenson1710/repomedic-web:latest
docker pull nguyenson1710/repomedic-cli:latest
```

## Usage

### CLI

```bash
# Triage a repository
npm run repomedic -- triage /path/to/repository

# Or use the built CLI
node apps/cli/dist/index.js triage /path/to/repository
```

### Web Dashboard

```bash
# Start the web dashboard
npm run dev:web

# Start the API server
npm run dev:api
```

Access the dashboard at `http://localhost:3000`

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        RepoMedic AI                              │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────┐ │
│  │   CLI App   │    │  Web App    │    │    API Server       │ │
│  │  (Commander)│    │  (Next.js)  │    │    (Express)        │ │
│  └──────┬──────┘    └──────┬──────┘    └──────────┬──────────┘ │
│         │                  │                       │            │
│         └──────────────────┼───────────────────────┘            │
│                            │                                     │
│                   ┌────────▼────────┐                           │
│                   │   Core Package  │                           │
│                   │  (Domain/Policy)│                           │
│                   └────────┬────────┘                           │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                 │
│         │                  │                  │                 │
│  ┌──────▼──────┐    ┌──────▼──────┐    ┌─────▼─────┐          │
│  │  fs-guard   │    │ exec-guard  │    │   Tools   │          │
│  │ (File Ops)  │    │ (Cmd Exec)  │    │ (Git/Repo)│          │
│  └─────────────┘    └─────────────┘    └───────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Security Model

| Component             | Protection                                         |
| --------------------- | -------------------------------------------------- |
| `SecureFileAccessor`  | TOCTOU-safe realpath + path allowlisting           |
| `SecureCommandRunner` | No shell injection, cwd confinement, timeouts      |
| `MutationPolicy`      | Blocks `.git/`, `.env*`, and other sensitive paths |
| `PathAllowlistPolicy` | Rejects `../`, absolute paths, symlink escapes     |

## Development

### Project Structure

```
RepoMedic_AI/
├── apps/
│   ├── api/          # Express REST API
│   ├── cli/          # Commander CLI
│   └── web/          # Next.js dashboard
├── packages/
│   ├── core/         # Domain, schemas, policies
│   ├── fs-guard/     # Secure file operations
│   ├── exec-guard/   # Secure command execution
│   └── api-client/   # Generated OpenAPI client
├── docs/
│   ├── architecture.md
│   └── security.md
└── evals/            # Evaluation suite
```

### Available Scripts

```bash
# Build all packages
npm run build

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint

# Format code
npm run format

# Start development servers
npm run dev:api    # Start API server
npm run dev:web    # Start web dashboard
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 📖 [Documentation](docs/)
- 🐛 [Issue Tracker](https://github.com/JasonTM17/RepoMedic_AI/issues)
- 💬 [Discussions](https://github.com/JasonTM17/RepoMedic_AI/discussions)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/JasonTM17">JasonTM17</a>
</p>
