# Security Model

RepoMedic prioritizes security by design, ensuring that the AI agent operates strictly within safe and defined boundaries when interacting with the user's local system.

## Key Security Components

### PathAllowlistPolicy

Restricts file system access to a predefined list of directories and files. The agent cannot read or modify files outside of this allowlist, protecting sensitive user data and system configurations.

### MutationPolicy

Defines rules for modifying files. It ensures that changes are only permitted in safe contexts and often requires explicit user approval before any destructive or modifying operations are executed on the real file system.

### SecureFileSystem (Realpath Confinement)

A secure wrapper around file system operations that performs realpath resolution and checks against the `PathAllowlistPolicy`. It prevents directory traversal attacks (e.g., using `../`) by ensuring all resolved paths fall within the permitted boundaries.

### BoundedExec

A confined execution environment for running scripts or commands. It limits the execution time, resource usage, and potentially the network access of commands invoked by the agent or during the testing phase of generated patches. This ensures that arbitrary code execution is isolated and controlled.
