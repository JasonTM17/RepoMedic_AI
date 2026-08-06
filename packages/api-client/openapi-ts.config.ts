import { defineConfig } from "@hey-api/openapi-ts";

export default defineConfig({
  input: "../../docs/openapi.yaml",
  output: "src/generated",
  plugins: ["@hey-api/typescript", "@hey-api/client-fetch", "@hey-api/sdk"],
});
