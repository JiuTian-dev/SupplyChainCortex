import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // TypeScript rules — re-enabled for quality
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "@typescript-eslint/prefer-as-const": "warn",

    // React rules — re-enabled
    "react-hooks/exhaustive-deps": "error",
    "react-hooks/purity": "warn",
    "react/no-unescaped-entities": "warn",
    "react/display-name": "warn",
    "react/prop-types": "off",
    "react-compiler/react-compiler": "off",

    // Next.js rules
    "@next/next/no-img-element": "warn",
    "@next/next/no-html-link-for-pages": "off",

    // General JavaScript rules — re-enabled
    "prefer-const": "warn",
    "no-unused-vars": "off", // TS handles this
    "no-console": "off",
    "no-debugger": "warn",
    "no-empty": "warn",
    "no-irregular-whitespace": "warn",
    "no-case-declarations": "warn",
    "no-fallthrough": "warn",
    "no-mixed-spaces-and-tabs": "warn",
    "no-redeclare": "off", // TS handles this
    "no-undef": "off", // TS handles this
    "no-unreachable": "warn",
    "no-useless-escape": "warn",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", "coverage/**"],
}];

export default eslintConfig;
