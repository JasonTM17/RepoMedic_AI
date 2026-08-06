# Security Model

RepoMedic prioritizes security by design, ensuring that the AI agent operates strictly within safe and defined boundaries when interacting with the user's local system.

## Key Security Components

### PathAllowlistPolicy (packages/core)

The foundational path validation policy. Normalizes paths (POSIX + Windows), rejects absolute paths, drive letters, UNC paths, and `..` traversal. Enforces component-exact allowlist matching and root confinement.

### MutationPolicy (packages/core)

Defines rules for modifying files. Enforces allowed operation kinds, allowlist gate, and denylist for protected paths (`.git/`, `.env*`, credentials). Controls `humanApprovalRequired` passthrough and returns `MutationDecision` with policy violations.

### SecureFileAccessor (packages/fs-guard)

A stateful, secure wrapper around `fs/promises`. Performs realpath resolution via `fs.realpath` and re-validates against the `PathAllowlistPolicy` to guarantee the actual path remains confined inside the repository root. Prevents TOCTOU attacks and symlink escape attempts.

Key behaviors:

- Resolves all paths using `fs.realpath` before validation
- Rejects any resolved path that escapes the repository root
- Blocks access to `.git/`, `.env`, and other protected paths
- Provides: `readFile`, `writeFile`, `listFiles`, `statFile`

### SecureCommandRunner (packages/exec-guard)

A confined execution environment for running Git commands, linters, formatters, and test suites.

Key behaviors:

- Enforces strict working directory confinement (repository root or valid subdirectory)
- Uses `child_process.spawn` with explicit argument arrays (no shell injection)
- Implements process timeouts with SIGTERM/SIGKILL for runaway tasks
- Limits stdout/stderr buffer sizes to prevent out-of-memory crashes
- Sanitizes environment variables (only explicit allowlist variables inherited)
- Enforces max output bytes with truncation

## Security Boundaries

| Component         | Protection                                     |
| ----------------- | ---------------------------------------------- |
| File Access       | TOCTOU-safe realpath + allowlist               |
| Path Traversal    | Reject `../`, absolute paths, symlink escapes  |
| Command Execution | No shell, cwd confinement, timeout enforcement |
| Environment       | Explicit allowlist only, no full inheritance   |
| Output Size       | Configurable max bytes with truncation         |
