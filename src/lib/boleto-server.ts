"use server";

import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

/**
 * Server functions para o módulo de boleto bancário (Norvo).
 *
 * Suporta múltiplos bancos com configuração por empresa.
 * Credenciais (código do cedente, carteira, chaves API) ficam no banco de dados
 * (tabela bancos_config) — nunca commitar.
 */

// ---------------------------------------------------------------------------
// Configuração por banco
// ---------------------------------------------------------------------------

type BancoConfig = {
  codigo: string;        // Código do banco (ex: 756 Sicoob, 341 Itaú)
  nome: string;
  digitoVerificador: (dados: string) => number; // Função DV específica do banco
  nossoNumeroPrefixo: string; // Prefixo do nosso número
};

const BANCOS: Record<string, BancoConfig> = {
  sicoob: {
    codigo: "756",
    nome: "Sicoob",
    digitoVerificador: (dados) => modulo11(dados, 9, 2),
    nossoNumeroPrefixo: "0001",
  },
  itau: {
    codigo: "341",
    nome: "Itaú",
    digitoVerificador: (dados) => modulo11(dados, 9, 2),
    nossoNumeroPrefixo: "0001",
  },
};

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
  sacadoDocumento: z.string().min(11),
  sacadoLogradouro: z.string().min(1),
  sacadoNumero: z.string().min(1),
  sacadoBairro: z.string().min(1),
  sacadoCidade: z.string().min(1),
  sacadoUf: z.string().length(2),
  sacadoCep: z.string().min(8),
  numeroDocumento: z.string().min(1),
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

function gerarNossoNumero(cfg: any): string {
  // Nosso número sequencial baseado em timestamp
  // Em produção, idealmente viria de faixa alocada pelo banco ou do retorno CNAB
  const ts = Date.now().toString().slice(-6);
  const prefixo = (BANCOS[cfg.banco as keyof typeof BANCOS]?.nossoNumeroPrefixo || "0001");
  return `${prefixo}${ts}`;
}

function fatorVencimentoDe(dataVencimento: string): string {
  const ref = new Date("1997-10-07");
  const alvo = new Date(dataVencimento);
  const diff = Math.ceil((alvo.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24));
  return String(diff).padStart(4, "0");
}

function gerarCodigoBarras(cfg: any, nossoNumero: string, valor: number, vencimento: string): string {
  const bancoCfg = BANCOS[cfg.banco as keyof typeof BANCOS] || BANCOS.sicoob;
  const bancoCod = bancoCfg.codigo;
  const moeda = "9";
  const fatorVencimento = fatorVencimentoDe(vencimento);
  const valorStr = Number(valor).toFixed(2).replace(/\./g, "").padStart(13, "0");
  const livre = nossoNumero.padStart(25, "0");
  const dvGeral = bancoCfg.digitoVerificador(bancoCod + moeda + fatorVencimento + valorStr + livre);
  return bancoCod + moeda + dvGeral + fatorVencimento + valorStr + livre;
}

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

// ---------------------------------------------------------------------------
// Server function: gerar boleto
// ---------------------------------------------------------------------------

export const gerarBoletoFn = createServerFn({ method: "POST" })
  .validator(GerarBoletoInput)
  .handler(async ({ data }) => {
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

    const bancoCfg = BANCOS[cfg.banco as keyof typeof BANCOS];
    if (!bancoCfg) {
      throw new Error(`Banco "${cfg.banco}" não suportado. Configure um banco válido (sicoob, itau).`);
    }

    const nossoNumero = gerarNossoNumero(cfg);
    const codigoBarras = gerarCodigoBarras(cfg, nossoNumero, data.valor, data.vencimento);
    const linhaDigitavel = gerarLinhaDigitavel(codigoBarras);

    const { data: boleto, error: insertErr } = await supabaseAdmin
      .from("boletos")
      .insert({
        empresa_id: data.empresaId,
        lancamento_id: data.lancamentoId,
        cte_id: data.cteId,
        banco: cfg.banco,
        codigo_cedente: cfg.codigo_cedente,
        carteira: cfg.carteira,
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
        "Boleto gerado com status pendente. Aguardando pagamento. Processe o arquivo de retorno CNAB para baixa automática.",
    };
  });

// ---------------------------------------------------------------------------
// Server function: processar retorno CNAB 240
// ---------------------------------------------------------------------------

export const processarRetornoCnabFn = createServerFn({ method: "POST" })
  .validator(ProcessarRetornoInput)
  .handler(async ({ data }) => {
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
      const tipoRegistro = linha.slice(0, 1);
      if (tipoRegistro !== "3") continue;

      const nossoNumero = linha.slice(110, 130).replace(/^0+/, "") || "";
      const valorPago = Number(linha.slice(130, 145)) / 100 || 0;
      const dataPagamentoRaw = linha.slice(145, 153);
      const dataPagamento =
        dataPagamentoRaw.length === 8
          ? `${dataPagamentoRaw.slice(4, 8)}-${dataPagamentoRaw.slice(2, 4)}-${dataPagamentoRaw.slice(0, 2)}`
          : null;

      if (!nossoNumero) continue;

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
