/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  env: {
    es2022: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
  extends: ["eslint:recommended"],
  ignorePatterns: [
    "dist/**",
    "node_modules/**",
    ".next/**",
    ".turbo/**",
    "coverage/**",
    "generated/**",
    "*.config.js",
    "*.config.cjs",
    "*.config.mjs",
    "*.config.ts",
  ],
};
