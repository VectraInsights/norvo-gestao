import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // catch vazio = falha silenciosa intencional (melhor esforço: parse/limpeza/limpeza
      // de recurso). O resto do bloco vazio continua sendo erro.
      "no-empty": ["error", { allowEmptyCatch: true }],
      // Débito legado: ~1.500 `any` acumulados (padrão "as never" das tabelas fora do
      // types.ts). Como warn, aparecem em todo lint sem falhar o gate — zerar exige
      // tipagem incremental, não uma varredura cega.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  eslintPluginPrettier,
);
