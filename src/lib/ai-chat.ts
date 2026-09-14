/**
 * Assistente AI Norvo — system prompt, tools e handler.
 * Roda no Cloudflare Worker via Workers AI binding.
 */
import { createClient } from "@supabase/supabase-js";

const SYSTEM_PROMPT = `Você é o Assistente Norvo, um assistente de IA incorporado ao ERP Norvo Gestão.
Seu papel é ajudar os usuários a navegar e usar o sistema.

REGRAS:
- Responda SEMPRE em português brasileiro.
- Seja conciso e direto (máx 3-4 frases por resposta).
- Use as tools disponíveis para buscar dados quando o usuário pedir.
- NUNCA altere, crie ou delete dados — apenas consulte.
- Se não souber algo, diga que não tem essa informação.
- Formate valores monetários como R$ X.XXX,XX.
- Para ações que o sistema não suporta (ex: "criar um cliente"), oriente o usuário sobre onde fazer no menu.
- Se o usuário pedir algo que envolva dados que não estão nas tools, diga que não tem acesso a esses dados.

MÓDULOS DO SISTEMA:
- Dashboard (visão geral)
- Financeiro (contas a pagar/receber, extrato, relatórios)
- Fiscal (NF-e emitidas/recebidas, CT-e, MDF-e)
- Estoque (produtos, movimentações, relatórios)
- Frota (veículos, motoristas, viagens, multas, RNTRC)
- Vendas (CRM, pedidos, orçamentos)
- RH (colaboradores, férias, folha, adiantamentos)
- Projetos (OS, projetos)
- Configurações (empresa, usuários, fiscal, templates)`;

export const AI_TOOLS = [
  {
    name: "buscar_cliente",
    description: "Busca um cliente pelo nome ou CNPJ. Retorna dados como razão social, CNPJ, cidade e UF.",
    parameters: {
      type: "object" as const,
      properties: {
        termo: { type: "string", description: "Nome ou CNPJ do cliente para buscar" },
      },
      required: ["termo"],
    },
  },
  {
    name: "listar_produtos",
    description: "Lista produtos do estoque. Pode filtrar por nome. Retorna nome, código, preço de venda e estoque atual.",
    parameters: {
      type: "object" as const,
      properties: {
        busca: { type: "string", description: "Filtro por nome do produto (parcial)" },
        limit: { type: "number", description: "Limite de resultados (padrão 10)" },
      },
    },
  },
  {
    name: "buscar_fornecedor",
    description: "Busca um fornecedor pelo nome ou CNPJ.",
    parameters: {
      type: "object" as const,
      properties: {
        termo: { type: "string", description: "Nome ou CNPJ do fornecedor" },
      },
      required: ["termo"],
    },
  },
  {
    name: "resumo_financeiro",
    description: "Retorna um resumo do financeiro: total de contas a pagar e receber, abertas e pagas no mês atual.",
    parameters: { type: "object" as const, properties: {} },
  },
  {
    name: "contas_a_pagar_vencidas",
    description: "Lista contas a pagar vencidas (atrasadas). Retorna fornecedor, valor, vencimento e descrição.",
    parameters: { type: "object" as const, properties: {} },
  },
  {
    name: "contas_a_receber_vencidas",
    description: "Lista contas a receber vencidas (inadimplência). Retorna cliente, valor, vencimento e descrição.",
    parameters: { type: "object" as const, properties: {} },
  },
  {
    name: "listar_veiculos",
    description: "Lista veículos da frota. Pode filtrar por placa ou marca. Retorna placa, modelo, tipo e status.",
    parameters: {
      type: "object" as const,
      properties: {
        busca: { type: "string", description: "Filtro por placa ou marca/modelo" },
      },
    },
  },
  {
    name: "listar_motoristas",
    description: "Lista motoristas ativos (colaboradores com cargo de motorista). Retorna nome, CPF e CNH.",
    parameters: { type: "object" as const, properties: {} },
  },
  {
    name: "buscar_nfe",
    description: "Busca uma NF-e pela chave de acesso. Retorna número, emitente, destinatário, valor e situação.",
    parameters: {
      type: "object" as const,
      properties: {
        chave: { type: "string", description: "Chave de acesso da NF-e (44 dígitos)" },
      },
      required: ["chave"],
    },
  },
  {
    name: "listar_ctes",
    description: "Lista CT-e emitidos recentemente. Retorna número, destinatário, valor e status.",
    parameters: {
      type: "object" as const,
      properties: {
        dias: { type: "number", description: "Últimos N dias (padrão 30)" },
      },
    },
  },
  {
    name: "info_empresa",
    description: "Retorna dados da empresa atual: razão social, CNPJ, UF, inscrição estadual.",
    parameters: { type: "object" as const, properties: {} },
  },
];

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  empresaId: string,
  supa: any
): Promise<string> {
  const limit = Math.min(Number(args.limit) || 10, 50);

  switch (toolName) {
    case "buscar_cliente": {
      const { data } = await supa
        .from("clientes" as never)
        .select("razao_social, cnpj, cidade, uf, telefone, email")
        .eq("empresa_id", empresaId)
        .or(`razao_social.ilike.%${args.termo}%,cnpj.ilike.%${args.termo}%`)
        .limit(5);
      return JSON.stringify(data ?? []);
    }
    case "listar_produtos": {
      let q = supa
        .from("produtos" as never)
        .select("nome, codigo, preco_venda, estoque_atual, unidade")
        .eq("empresa_id", empresaId);
      if (args.busca) q = q.ilike("nome", `%${args.busca}%`);
      const { data } = await q.order("nome").limit(limit);
      return JSON.stringify(data ?? []);
    }
    case "buscar_fornecedor": {
      const { data } = await supa
        .from("fornecedores" as never)
        .select("razao_social, cnpj, cidade, uf")
        .eq("empresa_id", empresaId)
        .or(`razao_social.ilike.%${args.termo}%,cnpj.ilike.%${args.termo}%`)
        .limit(5);
      return JSON.stringify(data ?? []);
    }
    case "resumo_financeiro": {
      const hoje = new Date().toISOString().slice(0, 10);
      const inicioMes = hoje.slice(0, 7) + "-01";
      const [pagar, receber, pagas, recebidas] = await Promise.all([
        supa.from("lancamentos_financeiros" as never).select("valor", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("tipo", "pagar").eq("status", "aberto"),
        supa.from("lancamentos_financeiros" as never).select("valor", { count: "exact", head: true }).eq("empresa_id", empresaId).eq("tipo", "receber").eq("status", "aberto"),
        supa.from("lancamentos_financeiros" as never).select("valor").eq("empresa_id", empresaId).eq("tipo", "pagar").eq("status", "pago").gte("data_pagamento", inicioMes).lte("data_pagamento", hoje),
        supa.from("lancamentos_financeiros" as never).select("valor").eq("empresa_id", empresaId).eq("tipo", "receber").eq("status", "pago").gte("data_pagamento", inicioMes).lte("data_pagamento", hoje),
      ]);
      const sum = (arr: any[] | null) => (arr ?? []).reduce((s, r) => s + Number(r.valor ?? 0), 0);
      return JSON.stringify({
        contas_a_pagar_abertas: { total: sum(pagar.data), quantidade: pagar.count },
        contas_a_receber_abertas: { total: sum(receber.data), quantidade: receber.count },
        pagas_no_mes: sum(pagas.data),
        recebidas_no_mes: sum(recebidas.data),
      });
    }
    case "contas_a_pagar_vencidas": {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data } = await supa
        .from("lancamentos_financeiros" as never)
        .select("descricao, valor, vencimento, fornecedor_nome")
        .eq("empresa_id", empresaId)
        .eq("tipo", "pagar")
        .eq("status", "aberto")
        .lt("vencimento", hoje)
        .order("vencimento")
        .limit(20);
      return JSON.stringify(data ?? []);
    }
    case "contas_a_receber_vencidas": {
      const hoje = new Date().toISOString().slice(0, 10);
      const { data } = await supa
        .from("lancamentos_financeiros" as never)
        .select("descricao, valor, vencimento, cliente_nome")
        .eq("empresa_id", empresaId)
        .eq("tipo", "receber")
        .eq("status", "aberto")
        .lt("vencimento", hoje)
        .order("vencimento")
        .limit(20);
      return JSON.stringify(data ?? []);
    }
    case "listar_veiculos": {
      let q = supa
        .from("veiculos" as never)
        .select("placa, marca_modelo, tipo, status, cor, ano")
        .eq("empresa_id", empresaId);
      if (args.busca) q = q.or(`placa.ilike.%${args.busca}%,marca_modelo.ilike.%${args.busca}%`);
      const { data } = await q.order("placa").limit(limit);
      return JSON.stringify(data ?? []);
    }
    case "listar_motoristas": {
      const { data } = await supa
        .from("colaboradores" as never)
        .select("nome, cpf, cargo, cnh_categoria, cnh_validade")
        .eq("empresa_id", empresaId)
        .eq("status", "ativo")
        .ilike("cargo", "%motorist%")
        .order("nome")
        .limit(20);
      return JSON.stringify(data ?? []);
    }
    case "buscar_nfe": {
      const { data } = await supa
        .from("nfe_documento" as never)
        .select("numero, serie, emitente_nome, emitente_cnpj, destinatario_nome, valor_total, status, chave_acesso")
        .eq("empresa_id", empresaId)
        .ilike("chave_acesso", `%${args.chave}%`)
        .limit(3);
      return JSON.stringify(data ?? []);
    }
    case "listar_ctes": {
      const dias = Number(args.dias) || 30;
      const dataLimite = new Date(Date.now() - dias * 86400000).toISOString();
      const { data } = await supa
        .from("cte_documentos" as never)
        .select("numero, chave_acesso, status, valor_servico, created_at")
        .eq("empresa_id", empresaId)
        .gte("created_at", dataLimite)
        .order("created_at", { ascending: false })
        .limit(20);
      return JSON.stringify(data ?? []);
    }
    case "info_empresa": {
      const { data } = await supa
        .from("empresas")
        .select("razao_social, cnpj, uf, inscricao_estadual, cidade")
        .eq("id", empresaId)
        .single();
      return JSON.stringify(data ?? {});
    }
    default:
      return JSON.stringify({ error: `Tool desconhecida: ${toolName}` });
  }
}

export async function handleAiChat(
  env: Record<string, string>,
  messages: Array<{ role: string; content: string }>,
  empresaId: string
): Promise<{ reply: string }> {
  const supa = createClient(
    env.SUPABASE_URL || "",
    env.SUPABASE_PUBLISHABLE_KEY || ""
  );

  const ai = (env as any).AI as { run: Function };
  if (!ai) throw new Error("Workers AI binding não configurado");

  // Tool calling: máximo 3 rodadas para evitar loops
  // Formato Workers AI (llama/hermes): { response, tool_calls: [{ name, arguments }] }
  // — tool_calls no TOPO do objeto, não aninhado; arguments pode vir objeto ou string JSON.
  let allMessages: Array<Record<string, unknown>> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];

  for (let round = 0; round < 3; round++) {
    const raw = (await ai.run("@cf/meta/llama-3.1-8b-instruct-fp8-fast", {
      messages: allMessages,
      tools: AI_TOOLS,
      max_tokens: 512,
    })) as { response?: unknown; tool_calls?: Array<Record<string, any>> };
    const out = (raw as any)?.result ?? raw ?? {};
    const calls: Array<Record<string, any>> = out.tool_calls ?? (out.response as any)?.tool_calls ?? [];
    const text = typeof out.response === "string" ? (out.response as string) : "";

    // Sem tool_calls: resposta final
    if (!calls.length) {
      return { reply: text || "Desculpe, não consegui processar sua pergunta." };
    }

    // Ecoa o turno do assistente (estilo tradicional da doc: content = tool serializada)
    allMessages.push({ role: "assistant", content: text || JSON.stringify(calls[0]) });

    // Executa cada tool_call
    for (const tc of calls) {
      const toolName: string = tc.name ?? tc.function?.name ?? "";
      let args: Record<string, unknown> = {};
      const rawArgs = tc.arguments ?? tc.function?.arguments;
      try {
        args = typeof rawArgs === "string" ? JSON.parse(rawArgs || "{}") : (rawArgs || {});
      } catch { args = {}; }
      const result = await executeTool(toolName, args, empresaId, supa);

      allMessages.push({
        role: "tool",
        content: result,
      });
    }
  }

  // Fallback após 3 rodadas
  const lastRaw = (await ai.run("@cf/meta/llama-3.1-8b-instruct-fp8-fast", {
    messages: allMessages,
    max_tokens: 512,
  })) as any;
  const lastOut = lastRaw?.result ?? lastRaw ?? {};
  const lastText = typeof lastOut.response === "string" ? lastOut.response : "";
  return { reply: lastText || "Consulta processada. Por favor, reformule sua pergunta." };
}
