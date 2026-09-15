import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

/**
 * Next.js ships its ruleset as eslintrc-style config, so it is bridged through
 * FlatCompat here. `next/core-web-vitals` covers the React hooks rules that
 * matter most for this app (the voice session lives behind a ref-backed effect).
 */
const config = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
];

export default config;
