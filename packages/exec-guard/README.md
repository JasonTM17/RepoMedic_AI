# RepoMedic command guard

`@jasonTM17/exec-guard` provides `SecureCommandRunner`, a standalone command
runner that uses argument arrays without a shell, confines `cwd` to its
repository root, applies timeouts, bounds output, and accepts an explicit
environment allowlist.

The package is configured for independent publication from `@jasonTM17/core`. The RepoMedic
core runtime currently uses its own `boundedExec` implementation; this package
is a public reusable boundary, not an implicit runtime dependency.

## Build

```bash
npm run build:exec-guard
```

The package archive contains compiled `dist/` output and declarations only.
