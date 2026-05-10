import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// All TypeScript, React, and Next.js rules are provided by eslint-config-next presets above.
// This override object only sets general JavaScript rules and disables noisy ones.
const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // Disable noisy TypeScript rules
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",

    // General JavaScript rules
    "prefer-const": "warn",
    "no-unused-vars": "off",
    "no-console": "off",
    "no-debugger": "warn",
    "no-empty": "warn",
    "no-irregular-whitespace": "warn",
    "no-mixed-spaces-and-tabs": "warn",
    "no-redeclare": "off",
    "no-undef": "off",
    "no-unreachable": "warn",
    "no-useless-escape": "warn",
    "no-case-declarations": "warn",
    "no-fallthrough": "warn",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "coverage/**", ".agents/**"],
}];

export default eslintConfig;
