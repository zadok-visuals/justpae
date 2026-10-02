import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Nothing should ship a stray console.log. console.error/warn stay allowed — the
      // webhook/cron/payout paths deliberately log failures to the deployment log.
      "no-console": ["error", { allow: ["error", "warn"] }],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
]);

export default eslintConfig;
