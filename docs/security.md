# Security Model

RepoMedic prioritizes security by design, ensuring that the AI agent operates strictly within safe and defined boundaries when interacting with the user's local system.

## Key Security Components

### PathAllowlistPolicy (packages/core)

The foundational path validation policy. Normalizes paths (POSIX + Windows), rejects absolute paths, drive letters, UNC paths, and `..` traversal. Enforces component-exact allowlist matching and root confinement.

### MutationPolicy (packages/core)

Defines rules for modifying files. Enforces allowed operation kinds, allowlist gate, and denylist for protected paths (`.git/`, `.env*`, credentials). Controls `humanApprovalRequired` passthrough and returns `MutationDecision` with policy violations.

### SecureFileSystem (packages/core)

The active core runtime wrapper around `fs/promises`. It performs syntactic
allowlist checks, resolves paths before access, re-validates root confinement,
blocks protected paths, and requires approval for mutations.

Key behaviors:

- Resolves paths using `fs.realpath` before access
- Rejects resolved paths that escape the repository root
- Blocks access to `.git/`, `.repomedic/`, `.env`, and other protected paths
- Bounds file and directory reads

### SecureFileAccessor (packages/fs-guard)

This is a separately published reusable wrapper. It performs realpath
confinement and delegates relative-path policy decisions to the policy object
provided by its caller. It is not currently wired as the implementation used
by `packages/core`.

### boundedExec (packages/core)

The active core command boundary allows a fixed command set, uses explicit
argument arrays with `shell: false`, enforces timeouts, and caps combined
output. Its default environment inherits the current process environment, so
callers requiring an explicit environment allowlist should use the standalone
`SecureCommandRunner` package.

### SecureCommandRunner (packages/exec-guard)

This separately published reusable runner enforces repository-root cwd
confinement, uses explicit argument arrays without a shell, applies timeouts,
bounds output, and accepts an explicit environment allowlist.

Key behaviors:

## Security Boundaries

| Component         | Protection                                                                          |
| ----------------- | ----------------------------------------------------------------------------------- |
| File Access       | Realpath revalidation + allowlist; filesystem race limits remain                    |
| Path Traversal    | Reject `../`, absolute paths, symlink escapes                                       |
| Command Execution | No shell, cwd confinement, timeout enforcement                                      |
| Environment       | Explicit allowlist in `exec-guard`; inherited by core `boundedExec` unless supplied |
| Output Size       | Configurable max bytes with truncation                                              |

### Patch rollback boundary

Automatic retry applies only exact unified-diff operations with hunks. Review
failure is reverted with `git apply --reverse` using those exact operations;
path-only rollback is rejected so unrelated dirty files are not restored over.
The candidate is built and dry-checked before approval. Its SHA-256 digest and
old-file hashes are persisted; approval applies only that exact candidate and
rejects worktree drift.

### API boundary

The API defaults to loopback binding for local development. Compose publishes
the services only on loopback and mounts the selected repository explicitly. For
trusted local clients that need an additional boundary, setting
`REPOMEDIC_API_TOKEN` enables constant-time checked `Authorization: Bearer`
authentication for `/v1/*`; health, readiness, and metrics remain available for
healthchecks. The token is optional by design for the single-user local default,
not a claim of multi-tenant isolation.
