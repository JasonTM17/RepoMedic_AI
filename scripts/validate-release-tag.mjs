/* global console */

import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import process from "node:process";

const tag = process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME ?? "";
if (!/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) {
  throw new Error(
    `Expected a semantic-version tag such as v0.1.0, received: ${tag}`,
  );
}

const expectedVersion = tag.slice(1);
const tagCommit = execFileSync(
  process.platform === "win32" ? "git.exe" : "git",
  ["rev-parse", "--verify", `refs/tags/${tag}^{commit}`],
  { encoding: "utf8" },
).trim();
const headCommit = execFileSync(
  process.platform === "win32" ? "git.exe" : "git",
  ["rev-parse", "HEAD"],
  { encoding: "utf8" },
).trim();
if (tagCommit !== headCommit) {
  throw new Error(`Release tag ${tag} does not point at the checked-out HEAD.`);
}

const workspaces = [
  "packages/core",
  "packages/fs-guard",
  "packages/exec-guard",
  "packages/api-client",
];

for (const workspace of workspaces) {
  const packageJson = JSON.parse(
    await readFile(`${workspace}/package.json`, "utf8"),
  );
  if (packageJson.version !== expectedVersion) {
    throw new Error(
      `${workspace} is ${packageJson.version}; release tag is ${expectedVersion}`,
    );
  }
}

console.log(`Release tag ${tag} matches all package versions.`);
