import { defineConfig } from "vitest/config"
import path from "node:path"

process.env.TZ = "UTC"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    exclude: ["**/node_modules/**", "tests/smoke/**"],
    passWithNoTests: true,
    env: {
      // xvm-api.ts functions no-op-guard on this being unset; tests stub fetch
      // and never hit a real host, so any non-empty value satisfies the guard.
      XVM_API_BASE_URL: "http://xvm-api.test",
    },
  },
})
