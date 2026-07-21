import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error"
    }
  },
  {
    ignores: ["node_modules/**", ".next/**", "next-env.d.ts", "coverage/**", "tests/fixtures/**"]
  }
);
