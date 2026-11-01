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
    "clean-pending-owner.js",
    // Run via `tsx`, not node - tsx resolves the .ts prisma client import:
    "backfill-venue-profile.js",
    // Run via `tsx`, not `node` - needs the generated TS Prisma client, see its own header comment.
    "backfill-gallery-images.js",
  ]),
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/lib/prisma", "**/generated/prisma", "**/generated/prisma/*"],
              message: "Prisma is being removed. Use xvm-api. See docs/PRISMA_MIGRATION_MANIFEST.md.",
            },
          ],
        },
      ],
    },
  },
  {
    // Shrinks to empty as the Prisma cutover lands. Do not add to it.
    files: [
      "lib/prisma.ts",
      "lib/auth.ts",
      "lib/api/venue-access.ts",
      "app/api/venues/[[]venueId]/route.ts",
      "scripts/**",
    ],
    rules: { "no-restricted-imports": "off" },
  },
])

export default eslintConfig
