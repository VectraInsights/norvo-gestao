import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async scheduled(_event: unknown, env: Record<string, string>, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    // Cloudflare Cron: 03–09 UTC (00–06 BRT) — reaproveita handleSefazCron
    // Injeta env do Worker em process.env para o helper ler SUPABASE_URL/KEY
    try {
      if (typeof process !== "undefined" && env) {
        for (const [k, v] of Object.entries(env)) (process.env as any)[k] = v;
      }
      const { handleSefazCron } = await import("./lib/sefaz-cron");
      ctx.waitUntil(handleSefazCron().then(r => r.text().then(t => console.log("[scheduled] sefaz-cron", t)).catch(e => console.error("[scheduled] err", e))));
    } catch (e) { console.error("[scheduled] fail", e); }
  },
  async fetch(request: Request, env: unknown, ctx: unknown) {
    // Proxy SEFAZ — roda no Vercel (Node.js com mTLS).
    // No CF Worker, esta roda nunca é atingida (o Worker chama o Vercel).
    const url = new URL(request.url);
    if (url.pathname === "/api/sefaz" && request.method === "POST") {
      try {
        const { handleSefazProxy } = await import("./lib/sefaz-proxy");
        return await handleSefazProxy(request);
      } catch (error) {
        console.error("[sefaz-proxy]", error);
        return new Response(JSON.stringify({ error: String(error) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Cron SEFAZ — busca notas automaticamente 2x/dia
    if (url.pathname === "/api/sefaz-cron" && request.method === "GET") {
      try {
        const { handleSefazCron } = await import("./lib/sefaz-cron");
        return await handleSefazCron();
      } catch (error) {
        console.error("[sefaz-cron]", error);
        return new Response(JSON.stringify({ error: String(error) }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
