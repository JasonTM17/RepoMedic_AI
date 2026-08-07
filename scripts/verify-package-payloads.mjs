/* global console */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const packages = [
  { workspace: "@jasonTM17/core", label: "core", directory: "packages/core" },
  {
    workspace: "@jasonTM17/fs-guard",
    label: "fs-guard",
    directory: "packages/fs-guard",
  },
  {
    workspace: "@jasonTM17/exec-guard",
    label: "exec-guard",
    directory: "packages/exec-guard",
  },
  {
    workspace: "@jasonTM17/api-client",
    label: "api-client",
    directory: "packages/api-client",
  },
];

function collectDistFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path
      .join(prefix, entry.name)
      .replaceAll(path.sep, "/");
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectDistFiles(absolutePath, relativePath);
    }
    if (!entry.isFile()) return [];
    return [`dist/${relativePath}`];
  });
}

function packMetadata(workspace) {
  const npmArgs = ["pack", "--dry-run", "--json", `--workspace=${workspace}`];
  const command =
    process.platform === "win32"
      ? (process.env.ComSpec ?? "cmd.exe")
      : npmExecutable;
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `${npmExecutable} ${npmArgs.join(" ")}`]
      : npmArgs;
  const output = execFileSync(command, commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  const metadata = JSON.parse(output);
  if (!Array.isArray(metadata) || metadata.length !== 1) {
    throw new Error(`Unexpected npm pack output for ${workspace}`);
  }
  return metadata[0];
}

for (const { workspace, label, directory } of packages) {
  const metadata = packMetadata(workspace);
  if (metadata.name !== workspace) {
    throw new Error(`Expected ${workspace}, received ${metadata.name}`);
  }
  const manifest = JSON.parse(
    readFileSync(path.join(directory, "package.json"), "utf8"),
  );
  if (manifest.license !== "MIT") {
    throw new Error(`${label}: package.json must declare license MIT`);
  }
  if (JSON.stringify(manifest.files) !== JSON.stringify(["dist"])) {
    throw new Error(`${label}: package.json files must be exactly ["dist"]`);
  }

  const files = metadata.files?.map((file) => file.path) ?? [];
  const expectedFiles = new Set([
    "README.md",
    "package.json",
    ...collectDistFiles(path.join(directory, "dist")),
  ]);
  const actualFiles = new Set(files);
  const missing = [...expectedFiles].filter((file) => !actualFiles.has(file));
  const unexpected = [...actualFiles].filter(
    (file) => !expectedFiles.has(file),
  );
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `${label}: archive mismatch; missing=${missing.join(", ") || "none"}; unexpected=${unexpected.join(", ") || "none"}`,
    );
  }

  console.log(
    `${workspace}@${metadata.version}: ${files.length} intended files`,
  );
}

console.log("Package payload checks passed.");
