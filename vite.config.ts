import type { UserConfig } from "vite";
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";

import { nitro } from "nitro/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

// Substitui o antigo wrapper @lovable.dev/vite-tanstack-config.
// Ordem dos plugins importa: tanstackStart ANTES de viteReact.
export default defineConfig(({ mode, command }) => {
  // Expõe apenas variáveis públicas no bundle. A Vercel mantém tanto os nomes
  // VITE_* quanto os nomes nativos do Supabase; os aliases evitam divergência
  // entre preview, produção e desenvolvimento local.
  const loadedEnv = loadEnv(mode, process.cwd(), "");
  const publicEnv = {
    VITE_SUPABASE_URL: loadedEnv.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || loadedEnv.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || loadedEnv.SUPABASE_URL || process.env.SUPABASE_URL,
    VITE_SUPABASE_PUBLISHABLE_KEY: loadedEnv.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || loadedEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || loadedEnv.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY,
  };
  const envDefine: Record<string, string> = {};
  for (const [key, value] of Object.entries(publicEnv)) {
    if (value) envDefine[`import.meta.env.${key}`] = JSON.stringify(value);
  }
  // Versão visível no rodapé do menu (mata a dúvida "está no deploy?").
  // A Vercel injeta VERCEL_GIT_COMMIT_SHA automaticamente a cada build.
  envDefine["__BUILD_SHA__"] = JSON.stringify(
    (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 7) || "local",
  );


  const config: UserConfig = {
    define: envDefine,
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      tsconfigPaths: true,
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
        "pdfjs-dist",
      ],
    },
    plugins: [
      tailwindcss(),
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
