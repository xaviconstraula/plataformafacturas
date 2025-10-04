import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [{
  ignores: [
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "generated/**",
    "generated/prisma/**",
    "prisma/migrations/**",
    "**/*.d.ts",
    "**/*.min.js",
    "**/dist/**",
    "**/tmp/**",
    "tmp/**"
  ]
}, ...compat.extends("next/core-web-vitals", "next/typescript"), {
  rules: {
    "@typescript-eslint/no-unused-vars": "off"
  }
}, {
  files: ["example_gemini/**/*.ts"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off"
  }
}];

export default eslintConfig;
