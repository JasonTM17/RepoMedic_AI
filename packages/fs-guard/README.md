# RepoMedic filesystem guard

`@jasonTM17/fs-guard` provides `SecureFileAccessor`, a standalone filesystem
wrapper for callers that need relative-path validation, realpath confinement,
and a policy callback before reads or writes.

The package is configured for independent publication from `@jasonTM17/core`. The RepoMedic
core runtime currently uses its own `SecureFileSystem` implementation; this
package is a public reusable boundary, not an implicit runtime dependency.

## Build

```bash
npm run build:fs-guard
```

The package archive contains compiled `dist/` output and declarations only.
