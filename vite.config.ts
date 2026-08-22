import type { UserConfig } from "vite";
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

// Substitui o antigo wrapper @lovable.dev/vite-tanstack-config.
// Ordem dos plugins importa: tanstackStart ANTES de viteReact.
export default defineConfig(({ mode, command }) => {
  // Injeta VITE_* dos .env como constantes no bundle (mesmo comportamento do
  // envDefine do wrapper; vars da Vercel entram via process.env nativamente).
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), "VITE_"))) {
    envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }

  const isDevBuild = mode === "development";

  const config: UserConfig = {
    define: envDefine,
    ...(isDevBuild
      ? {
          environments: {
            client: { define: { "process.env.NODE_ENV": JSON.stringify("development") } },
          },
        }
      : {}),
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: [
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-query",
        "@tanstack/query-core",
      ],
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
      ],
    },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        importProtection: {
          behavior: "error",
          client: {
            files: ["**/server/**"],
            specifiers: ["server-only"],
          },
        },
        // Redireciona a entry do servidor SSR para src/server.ts (wrapper de erros).
        server: { entry: "server" },
      }),
      // Build-only: empacota o servidor SSR. Preset padrão cloudflare-module;
      // sobrescreva com NITRO_PRESET=node-server (local) ou vercel quando preciso.
      ...(command === "build" ? [nitro({ defaultPreset: "cloudflare-module" })] : []),
      viteReact(),
    ],
  };

  return config;
});
