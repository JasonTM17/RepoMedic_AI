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
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["apps/**/src/**/*.ts", "packages/**/src/**/*.ts"],
      exclude: ["**/dist/**", "**/generated/**", "**/*.d.ts", "**/index.ts"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
