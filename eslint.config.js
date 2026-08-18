import tseslint from "typescript-eslint";
import astro from "eslint-plugin-astro";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", ".astro/**", ".build/**", "test-results/**", "public/runtime/**", "**/*.astro"]
  },
  ...astro.configs["flat/recommended"],
  ...tseslint.configs.recommended,
);
