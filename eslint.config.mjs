import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ignore scripts folder (dev-only tools)
    "scripts/**",
    // Ignore public folder (generated files)
    "public/**",
  ]),
  {
    rules: {
      // Allow setState in useEffect for legitimate patterns like:
      // - Loading initial state from sessionStorage/localStorage
      // - Syncing state when props change
      // - Fetching data on mount
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
