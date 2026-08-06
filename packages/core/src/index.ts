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

/** @deprecated use {@link packageVersion} */
export const corePackageName = "@repomedic/core";
/** @deprecated use the packageVersion export from version.js */
export const corePackageVersion = "0.1.0";
