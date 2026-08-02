import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  // ───────────────────────────────────────────────────────────────────────
  // Architectural boundary: src/core stays framework-agnostic.
  //
  // The whole mobile-app plan (roadmap R4) rests on core/ being importable
  // by React Native unchanged. That only stays true if it is mechanically
  // enforced — a convention people are asked to remember is a convention
  // that erodes. Breaking this is a lint error, and CI fails on it.
  // ───────────────────────────────────────────────────────────────────────
  {
    files: ["src/core/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "next",
                "next/*",
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
                "server-only",
                "client-only",
              ],
              message:
                "src/core must stay framework-agnostic — the future React Native app imports it unchanged. Put framework code in src/app or src/ui.",
            },
            {
              group: ["@/app/*", "@/ui/*", "../app/*", "../ui/*"],
              message:
                "Dependencies point inward: app/ui may import core, never the reverse.",
            },
          ],
        },
      ],
    },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "drizzle/**",
  ]),
]);

export default eslintConfig;
