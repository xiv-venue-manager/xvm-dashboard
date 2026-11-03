import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import prettier from "eslint-config-prettier/flat"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Standalone CJS ops scripts (run via `node <file>.js`, not part of ESM bundle):
    "apply-indexes.js",
  ]),
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/lib/prisma", "**/generated/prisma", "**/generated/prisma/*"],
              message: "Prisma has been removed. Use xvm-api. See docs/PRISMA_MIGRATION_MANIFEST.md.",
            },
          ],
        },
      ],
    },
  },
])

export default eslintConfig
