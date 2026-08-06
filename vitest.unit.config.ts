import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/**/tests/**/*.unit.test.ts",
      "packages/**/tests/**/*.unit.test.ts",
      "tests/**/*.unit.test.ts",
    ],
    environment: "node",
    globals: false,
    passWithNoTests: false,
  },
});
