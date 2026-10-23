"use server";

import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

/**
 * Server functions para o módulo de boleto bancário (Norvo).
 *
 * Fluxo suportado:
 *   1. Gerar boleto — registra no banco local com linha digitável/código de barras.
 *   2. Processar retorno CNAB 240 do banco para baixa automática.
 *   3. Baixar boleto manualmente (marcar como pago).
 *
 * Credenciais do banco (código do cedente, carteira, chaves API) ficam
 * exclusivamente no `.env` / env vars da Vercel — nunca commitar.
 */

// ---------------------------------------------------------------------------
// Schemas de validação
// ---------------------------------------------------------------------------

const GerarBoletoInput = z.object({
  empresaId: z.string().uuid(),
  lancamentoId: z.string().uuid().optional(),
  cteId: z.string().uuid().optional(),
  valor: z.number().positive(),
  vencimento: z.string(), // "YYYY-MM-DD"
  sacadoNome: z.string().min(1),
  sacadoDocumento: z.string().min(11), // CPF ou CNPJ só dígitos
  sacadoLogradouro: z.string().min(1),
  sacadoNumero: z.string().min(1),
  sacadoBairro: z.string().min(1),
  sacadoCidade: z.string().min(1),
  sacadoUf: z.string().length(2),
  sacadoCep: z.string().min(8),
  numeroDocumento: z.string().min(1), // nº do CT-e ou fatura
  descricao: z.string().min(1),
});

type GerarBoletoInput = z.infer<typeof GerarBoletoInput>;

const ProcessarRetornoInput = z.object({
  empresaId: z.string().uuid(),
  arquivoRetorno: z.string(), // base64 do arquivo CNAB 240 de retorno
});

type ProcessarRetornoInput = z.infer<typeof ProcessarRetornoInput>;

const BaixarBoletoInput = z.object({
  boletoId: z.string().uuid(),
  empresaId: z.string().uuid(),
  dataPagamento: z.string().optional(),
  valorPago: z.number().positive().optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function onlyDigits(s: string): string {
  return String(s ?? "").replace(/\D/g, "");
}

function modulo11(numero: string, base: number = 9, fatorInicial: number = 2): number {
  let soma = 0;
  let fator = fatorInicial;
  for (let i = numero.length - 1; i >= 0; i--) {
    soma += Number(numero[i]) * fator;
    fator = fator === base ? 2 : fator + 1;
  }
  const resto = soma % 11;
  return resto > 1 ? 11 - resto : 0;
}

/**
 * Gera linha digitável do boleto (padrão Febraban simplificada).
 * Código de barras: banco(3) + moeda(1) + DV(1) + fatorVencimento(4) + valor(13) + livre(25) + ...
 * Implementação simplificada — ajustar conforme layout específico de cada banco.
 */
function gerarLinhaDigitavel(codigoBarras: string): string {
  if (codigoBarras.length !== 44) return codigoBarras;
  const campo1 =
    codigoBarras.slice(0, 3) +
    codigoBarras.slice(32, 33) +
    codigoBarras.slice(33, 37) +
    modulo11(codigoBarras.slice(0, 3) + codigoBarras.slice(32, 33) + codigoBarras.slice(33, 37));
  const campo2 =
    codigoBarras.slice(37, 42) + modulo11(codigoBarras.slice(37, 42));
  const campo3 =
    codigoBarras.slice(42, 47) + modulo11(codigoBarras.slice(42, 47));
  const campo4 = codigoBarras.slice(4, 5);
  const campo5 = codigoBarras.slice(5, 47);
  return `${campo1} ${campo2} ${campo3} ${campo4} ${campo5}`;
}

function gerarNossoNumero(empresaId: string): string {
  // Nosso número sequencial baseado em timestamp + prefixo
  // Em produção, idealmente viria de faixa alocada pelo banco ou do retorno CNAB
  const ts = Date.now().toString().slice(-6);
  return `0001${ts}`;
}

// ---------------------------------------------------------------------------
// Server function: gerar boleto
// ---------------------------------------------------------------------------

export const gerarBoletoFn = createServerFn({ method: "POST" })
  .validator(GerarBoletoInput)
  .handler(async ({ data }) => {
    // Busca configuração do banco da empresa
    const { data: cfg, error: cfgErr } = await supabaseAdmin
      .from("bancos_config")
      .select("*")
      .eq("empresa_id", data.empresaId)
      .eq("ativo", true)
      .maybeSingle();

    if (cfgErr || !cfg) {
      throw new Error(
        "Banco de cobrança não configurado para esta empresa. Cadastre em Configurações > Bancos.",
      );
    }

    // Gera nosso número (placeholder — substituir por consulta ao banco/faixa alocada)
    const nossoNumero = gerarNossoNumero(data.empresaId);

    // Gera código de barras (44 posições, padrão Febraban)
    const bancoCod = cfg.banco === "itau" ? "341" : "000"; // Itaú = 341
    const moeda = "9";
    const fatorVencimento = fatorVencimentoDe(data.vencimento);
    const valorStr = Number(data.valor).toFixed(2).replace(/\./g, "").padStart(13, "0");
    const livre = nossoNumero.padStart(25, "0");
    const dvGeral = modulo11(bancoCod + moeda + fatorVencimento + valorStr + livre, 9, 2);
    const codigoBarras = bancoCod + moeda + dvGeral + fatorVencimento + valorStr + livre;

    const linhaDigitavel = gerarLinhaDigitavel(codigoBarras);

    // TODO: quando o Itaú liberar API, chamar aqui para registrar na CIP
    // e obter url_pdf e id_transacao_banco.
    // Exemplo:
    // const itauResp = await fetch(`${process.env.ITAU_API_URL}/boletos`, {
    //   method: "POST",
    //   headers: { Authorization: `Bearer ${process.env.ITAU_API_KEY}`, "Content-Type": "application/json" },
    //   body: JSON.stringify({ ... })
    // });

    // Insere boleto no banco (status pendente)
    const { data: boleto, error: insertErr } = await supabaseAdmin
      .from("boletos")
      .insert({
        empresa_id: data.empresaId,
        lancamento_id: data.lancamentoId,
        cte_id: data.cteId,
        banco: cfg.banco,
        nosso_numero: nossoNumero,
        linha_digitavel: linhaDigitavel,
        codigo_barras: codigoBarras,
        url_pdf: null,
        valor: data.valor,
        vencimento: data.vencimento,
        status: "pendente",
        id_transacao_banco: null,
        observacoes: `Gerado via Norvo — ${data.descricao}`,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;

    // Vincula ao lançamento financeiro se fornecido
    if (data.lancamentoId) {
      await supabaseAdmin
        .from("lancamentos_financeiros")
        .update({ documento: nossoNumero, forma_pagamento: "Boleto" })
        .eq("id", data.lancamentoId);
    }

    return {
      boletoId: boleto.id,
      nossoNumero: boleto.nosso_numero,
      linhaDigitavel: boleto.linha_digitavel,
      codigoBarras: boleto.codigo_barras,
      valor: boleto.valor,
      vencimento: boleto.vencimento,
      status: boleto.status,
      message:
        "Boleto gerado com status pendente. Aguardando pagamento. Quando o Itaú/Sicoob liberar API, a geração será automática na CIP.",
    };
  });

function fatorVencimentoDe(dataVencimento: string): string {
  const ref = new Date("1997-10-07"); // marco para fator de vencimento Febraban
  const alvo = new Date(dataVencimento);
  const diff = Math.ceil((alvo.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
  return String(diff).padStart(4, "0");
}

// ---------------------------------------------------------------------------
// Server function: processar retorno CNAB 240
// ---------------------------------------------------------------------------

export const processarRetornoCnabFn = createServerFn({ method: "POST" })
  .validator(ProcessarRetornoInput)
  .handler(async ({ data }) => {
    // Decodifica base64
    const bytes = Uint8Array.from(atob(data.arquivoRetorno), (c) => c.charCodeAt(0));
    const texto = new TextDecoder("iso-8859-1").decode(bytes);

    const linhas = texto.split("\n").filter(Boolean);
    const processados: Array<{
      nossoNumero: string;
      status: string;
      valorPago: number;
      dataPagamento: string;
    }> = [];

    for (const linha of linhas) {
      // CNAB 240 — registro de retorno (tipo 3)
      // Posições simplificadas — ajustar conforme layout exato do Sicoob/Itaú
      const tipoRegistro = linha.slice(0, 1);
      if (tipoRegistro !== "3") continue;

      const nossoNumero = linha.slice(110, 130).replace(/^0+/, "") || "";
      const valorPago = Number(linha.slice(130, 145)) / 100 || 0;
      const dataPagamentoRaw = linha.slice(145, 153); // DDMMYYYY
      const dataPagamento =
        dataPagamentoRaw.length === 8
          ? `${dataPagamentoRaw.slice(4, 8)}-${dataPagamentoRaw.slice(2, 4)}-${dataPagamentoRaw.slice(0, 2)}`
          : null;

      if (!nossoNumero) continue;

      // Marca boleto como pago
      const { error } = await supabaseAdmin
        .from("boletos")
        .update({
          status: "pago",
          valor_pago: valorPago,
          data_pagamento: dataPagamento || new Date().toISOString(),
        })
        .eq("nosso_numero", nossoNumero);

      if (error) continue;

      processados.push({
        nossoNumero,
        status: "pago",
        valorPago,
        dataPagamento: dataPagamento || "",
      });
    }

    return { processados: processados.length, detalhes: processados };
  });

// ---------------------------------------------------------------------------
// Server function: baixar boleto (marcar como pago manualmente)
// ---------------------------------------------------------------------------

export const baixarBoletoFn = createServerFn({ method: "POST" })
  .validator(BaixarBoletoInput)
  .handler(async ({ data }) => {
    const { data: boleto, error } = await supabaseAdmin
      .from("boletos")
      .update({
        status: "pago",
        data_pagamento: data.dataPagamento || new Date().toISOString(),
        valor_pago: data.valorPago,
      })
      .eq("id", data.boletoId)
      .eq("empresa_id", data.empresaId)
      .select()
      .single();

    if (error) throw error;

    // Se vinculado a lançamento financeiro, baixa o lançamento
    if (boleto?.lancamento_id) {
      await supabaseAdmin
        .from("lancamentos_financeiros")
        .update({
          status: "pago",
          data_pagamento: boleto.data_pagamento,
          valor_pago: boleto.valor_pago,
        })
        .eq("id", boleto.lancamento_id);
    }

    return { boletoId: boleto.id, status: boleto.status };
  });
