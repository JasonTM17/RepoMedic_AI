import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PathConfinementError,
  PolicyDeniedError,
  SecureFileSystem,
} from "../src/fs/index.js";

const TMP = join(tmpdir(), "repomedic-secure-fs-test");

async function makeFs(allowlist: string[] = ["src", "README.md"]) {
  return new SecureFileSystem({ root: TMP, allowlist });
}

beforeEach(async () => {
  await mkdir(join(TMP, "src"), { recursive: true });
  await writeFile(join(TMP, "src", "hello.ts"), "export const x = 1;\n");
  await writeFile(join(TMP, "README.md"), "# Hello\n");
});

afterEach(async () => {
  await rm(TMP, { recursive: true, force: true });
});

describe("SecureFileSystem.readFile", () => {
  it("reads an allowlisted file", async () => {
    const fs = await makeFs();
    const result = await fs.readFile("src/hello.ts");
    expect(result.content).toContain("export const x");
    expect(result.truncated).toBe(false);
  });

  it("rejects an absolute path", async () => {
    const fs = await makeFs();
    await expect(fs.readFile("/etc/passwd")).rejects.toBeInstanceOf(
      PathConfinementError,
    );
  });

  it("rejects a traversal path", async () => {
    const fs = await makeFs();
    await expect(fs.readFile("../outside")).rejects.toBeInstanceOf(
      PathConfinementError,
    );
  });

  it("rejects a non-allowlisted path", async () => {
    const fs = await makeFs();
    await expect(fs.readFile("secrets.env")).rejects.toBeInstanceOf(
      PathConfinementError,
    );
  });
});

describe("SecureFileSystem.listDir", () => {
  it("lists the root directory", async () => {
    const fs = await makeFs();
    const result = await fs.listDir(".");
    expect(result.entries).toContain("src");
    expect(result.truncated).toBe(false);
  });

  it("lists an allowlisted subdirectory", async () => {
    const fs = await makeFs();
    const result = await fs.listDir("src");
    expect(result.entries).toContain("hello.ts");
  });
});

describe("SecureFileSystem.exists", () => {
  it("returns true for existing file", async () => {
    const fs = await makeFs();
    expect(await fs.exists("src/hello.ts")).toBe(true);
  });

  it("returns false for missing file without error", async () => {
    const fs = await makeFs();
    expect(await fs.exists("src/missing.ts")).toBe(false);
  });
});

describe("SecureFileSystem.writeFile", () => {
  it("writes an approved file", async () => {
    const fs = await makeFs();
    await fs.writeFile("src/new.ts", "export const y = 2;\n", true);
    const result = await fs.readFile("src/new.ts");
    expect(result.content).toContain("export const y");
  });

  it("rejects write without approval", async () => {
    const fs = await makeFs();
    await expect(
      fs.writeFile("src/new.ts", "content", false),
    ).rejects.toBeInstanceOf(PolicyDeniedError);
  });

  it("rejects write to non-allowlisted path", async () => {
    const fs = await makeFs();
    await expect(
      fs.writeFile(".env", "SECRET=123", true),
    ).rejects.toBeInstanceOf(PolicyDeniedError);
  });
});

describe("SecureFileSystem.createFile", () => {
  it("creates an approved file", async () => {
    const fs = await makeFs();
    await fs.createFile("src/created.ts", "// new\n", true);
    const result = await fs.readFile("src/created.ts");
    expect(result.content).toContain("// new");
  });

  it("rejects create without approval", async () => {
    const fs = await makeFs();
    await expect(
      fs.createFile("src/x.ts", "content", false),
    ).rejects.toBeInstanceOf(PolicyDeniedError);
  });
});
