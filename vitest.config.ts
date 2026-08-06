import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/**/tests/**/*.test.ts",
      "packages/**/tests/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**", "**/dist/**", "fixtures/**/*.bug.test.ts"],
    environment: "node",
    globals: false,
    passWithNoTests: false,
  },
});
