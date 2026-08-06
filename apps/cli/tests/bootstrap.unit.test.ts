import { describe, expect, it } from "vitest";

import { createProgram } from "../src/index.js";

describe("RepoMedic CLI bootstrap", () => {
  it("declares the public command name and doctor command", () => {
    const program = createProgram();

    expect(program.name()).toBe("repomedic");
    expect(program.commands.map((command) => command.name())).toContain(
      "doctor",
    );
  });
});
