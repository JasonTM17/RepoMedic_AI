export * from "./version.js";
export * from "./domain/index.js";
export * from "./schemas/index.js";
export * from "./schemas/agreement.js";
export * from "./policy/index.js";
export * from "./fs/index.js";
export * from "./process/index.js";
export * from "./model/index.js";
export * from "./tools/repo/index.js";
export * from "./tools/patch/index.js";
export * from "./checks/index.js";
export * from "./agents/explorer/index.js";
export * from "./agents/patcher/index.js";
export * from "./agents/reviewer/index.js";
export * from "./workflows/retry/index.js";
export * from "./workflows/coordinator/coordinator.js";
export * from "./approval/index.js";
export * from "./tracing/index.js";

/** @deprecated use {@link packageVersion} */
export const corePackageName = "@repomedic/core";
/** @deprecated use the packageVersion export from version.js */
export const corePackageVersion = "0.1.0";
