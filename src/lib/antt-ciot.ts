// Integração direta ANTT — PEF/CIOT para ETC com frota própria (sem TAC).
// Base técnica: DCS PEF v1.1 + fluxos validados contra homologação ANTT.
// Regras duras:
// - Webservice direto SÓ emite em nome próprio: contratado == titular do
//   certificado (regra B115; rejeição 314 caso contrário). TAC só via IPEF.
// - Homologação exige CNPJ+certificado e placas cadastrados na ANTT
//   (pef@antt.gov.br); sem isso, rejeita por vínculo/piso.
// - CIOT deve ser gerado ANTES do início da operação (Portaria SUROC 6/2026);
//   encerrar em até 5 dias (lotação) — multa R$ 10.500 por ocorrência.
import https from "node:https";

export const ANTT_BASE = {
  homologacao: "https://appservices-hml.antt.gov.br/pefServices/api",
  producao: "https://appservices.antt.gov.br/pefServices/api",
} as const;

export type AnttEnv = keyof typeof ANTT_BASE;

const CODIGOS_SUCESSO = new Set(["000000", "110", "111"]);

// API key do gerador de IdOperacao (/token+/gerar), pública (embutida na DLL
// oficial da ANTT): bytes XOR 42.
const API_KEY_XOR = [25, 127, 93, 120, 119, 105, 115, 126, 79, 107, 123, 120, 108];
const apiKeyDecodificada = () => API_KEY_XOR.map((x) => String.fromCharCode(x ^ 42)).join("");

export const soDig = (s: unknown) => String(s ?? "").replace(/\D/g, "");

// RNTRC sempre com 9 dígitos (8 → zero à esquerda).
export function padRntrc9(rntrc: unknown): string {
  const d = soDig(rntrc);
  if (d.length === 9) return d;
  if (d.length === 8) return "0" + d;
  return d;
}

// Data/hora de Brasília com offset explícito (UTC/Z rejeita — erro 269).
export function brtNow(): string {
  const f = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return f.format(new Date()).replace(" ", "T") + "-03:00";
}

export function gerarIdentificadorPix(d?: Date): string {
  const x = d ?? new Date();
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${x.getFullYear()}${p(x.getMonth() + 1)}${p(x.getDate())}${p(x.getHours())}${p(x.getMinutes())}${p(x.getSeconds())}`;
}

export type VeiculoCiot = { placa: string; eixos: number; rntrc?: string };
export type PagamentoCiot = {
  tipo: number; // 1 IP, 2 CC, 3 poupança, 4 conta pgto, 5 outros, 6 PIX
  docCreditado: string;
  indPagamento?: number;
  chavePix?: string;
  codigoInstFin?: string;
  agencia?: string;
  conta?: string;
};
export type OrigemDestinoCiot = {
  cmun?: string;
  cep?: string;
  lat?: number;
  lon?: number;
};
export type CargaCiot = { peso?: number; tipoCodigo?: number; naturezaCodigo?: number };

export type DeclaracaoCiotInput = {
  tipoOperacao?: number; // 1 lotação (padrão), 2 fracionada, 3 TAC-agregado
  contratado: { doc: string; rntrc: string };
  contratante: { doc: string; rntrc?: string };
  destinatarioDoc?: string;
  veiculos: VeiculoCiot[];
  pagamento: PagamentoCiot;
  origem: OrigemDestinoCiot;
  destino: OrigemDestinoCiot;
  distanciaKm: number;
  qtdViagens?: number;
  carga?: CargaCiot;
  valorFrete: number;
  dataInicioViagem: string; // YYYY-MM-DD
  dataFimViagem: string; // YYYY-MM-DD
  indAltoDesempenho?: boolean;
  indRetornoVazio?: boolean;
  composicaoVeicular?: boolean;
  idOperacao?: string; // 12 chars; se ausente, gera via /token+/gerar
};

// Regra B115: contratado tem que ser o titular do certificado.
export function b115Ok(certCnpj: string, contratadoDoc: string): { ok: boolean; motivo: string } {
  const a = soDig(certCnpj);
  const b = soDig(contratadoDoc);
  if (a && b && a === b) return { ok: true, motivo: "" };
  return {
    ok: false,
    motivo: `ANTT só emite CIOT direto em nome próprio (regra B115): contratado (${b || "?"}) ≠ titular do certificado (${a || "?"}). Operações com TAC/subcontratado exigem IPEF ou CIOT manual.`,
  };
}

function odToDict(o: OrigemDestinoCiot, prefixoOrigem: boolean) {
  const P = prefixoOrigem ? "Origem" : "Destino";
  const d: Record<string, unknown> = {};
  if (o.cmun) d[`CodigoMunicipio${P}`] = o.cmun;
  if (o.cep) d[`Cep${P}`] = soDig(o.cep);
  if (o.lat !== undefined) d[`Latitude${P}`] = o.lat;
  if (o.lon !== undefined) d[`Longitude${P}`] = o.lon;
  return d;
}

export function buildDeclaracaoPayload(inp: DeclaracaoCiotInput, idOperacao: string) {
  const p = inp.pagamento;
  // Validação local antes do mTLS (evita 3 chamadas lentas p/ falhar no óbvio).
  // O tipo (automotor/implemento) é apurado pela ANTT no cadastro dela —
  // o payload de referência leva só Placa/RNTRCVeiculo/NumeroEixos, com os
  // eixos de CADA veículo (nunca a soma da combinação num item só).
  if (!Array.isArray(inp.veiculos) || inp.veiculos.length === 0)
    throw new Error("Informe ao menos a placa da tração com os eixos dela.");
  for (const v of inp.veiculos || []) {
    const ex = Number((v as any).eixos);
    if (!Number.isInteger(ex) || ex < 1)
      throw new Error(`Quantidade de eixos inválida para a placa ${String((v as any).placa || "—")}: confira em Frota → Veículos.`);
  }
  const infPag: Record<string, unknown> = {
    TipoPagamento: Number(p.tipo),
    CpfCnpjCreditado: soDig(p.docCreditado),
    IndPagamento: Number(p.indPagamento ?? 0),
  };
  if (p.codigoInstFin) infPag.CodigoInstituicaoFinanceira = p.codigoInstFin;
  if (p.agencia) infPag.NumeroAgencia = p.agencia;
  if (p.conta) infPag.NumeroConta = p.conta;
  if (p.chavePix) {
    infPag.ChavePix = p.chavePix;
    infPag.IdentificadorPix = gerarIdentificadorPix();
  }
  const payload: Record<string, unknown> = {
    IdOperacaoTransporte: idOperacao,
    TipoOperacao: Number(inp.tipoOperacao ?? 1),
    CpfCnpjContratado: soDig(inp.contratado.doc),
    RNTRCContratado: padRntrc9(inp.contratado.rntrc),
    CpfCnpjContratante: soDig(inp.contratante.doc),
    ValorFrete: Number(inp.valorFrete),
    DataDeclaracao: brtNow(),
    IndContingencia: false,
    JustificativaContingencia: null,
    DataInicioViagem: inp.dataInicioViagem,
    DataFimViagem: inp.dataFimViagem,
    Veiculos: inp.veiculos.map((v) => ({
      Placa: String(v.placa || "").toUpperCase(),
      RNTRCVeiculo: v.rntrc ? padRntrc9(v.rntrc) : "",
      NumeroEixos: Number(v.eixos),
    })),
    InfPagamento: [infPag],
  };
  if (inp.contratante.rntrc) payload.RNTRCContratante = padRntrc9(inp.contratante.rntrc);
  if (inp.destinatarioDoc) payload.CpfCnpjDestinatario = soDig(inp.destinatarioDoc);
  const od: Record<string, unknown> = {};
  const o = odToDict(inp.origem, true);
  const d = odToDict(inp.destino, false);
  if (Object.keys(o).length) od.Origem = o;
  if (Object.keys(d).length) od.Destino = d;
  od.DistanciaPercorrida = Math.round(Number(inp.distanciaKm) || 0); // int! float quebra o transformer
  od.QtdViagens = Number(inp.qtdViagens ?? 1);
  payload.OrigemDestino = [od];
  const cg: Record<string, unknown> = {};
  // PesoCarga é obrigatório: usa o valor informado ou 1 como mínimo (ANTT rejeita 0 ou ausente).
  cg.PesoCarga = inp.carga?.peso !== undefined ? Math.round(Number(inp.carga.peso)) || 1 : 1;
  if (inp.carga?.tipoCodigo !== undefined) cg.CodigoTipoCarga = Number(inp.carga.tipoCodigo);
  // CodigoNaturezaCarga é obrigatório para tipo de operação 1 (lotação).
  // Padrão 1 = Carga Geral quando não informado explicitamente.
  cg.CodigoNaturezaCarga = Number(inp.carga?.naturezaCodigo ?? 1);
  if (Object.keys(cg).length) payload.DadosCarga = cg;
  payload.InfIndicadoresOperacionais = {
    IndAltoDesempenho: !!inp.indAltoDesempenho,
    IndRetornoVazio: !!inp.indRetornoVazio,
    ComposicaoVeicular: inp.composicaoVeicular ?? true,
  };
  return payload;
}

export type CiotResultado = {
  sucesso: boolean;
  codigo: string;
  mensagem: string;
  protocolo: string;
  idOperacao: string;
  ciotCodigo: string;
  ciotVerificador: string;
  ciotCompleto: string;
  aviso: string;
};

function postJson(opts: {
  agent: https.Agent;
  base: string;
  path: string;
  body: unknown;
  headers?: Record<string, string>;
}): Promise<{ status: number; json: any; text: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(opts.base + opts.path);
    const data = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    const req = https.request(
      {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: "POST",
        agent: opts.agent,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Content-Length": Buffer.byteLength(data),
          ...(opts.headers || {}),
        },
        timeout: 30000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json: any = null;
          try {
            json = JSON.parse(text);
          } catch {}
          resolve({ status: res.statusCode || 0, json, text });
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("Timeout 30s na ANTT")));
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function agentMtls(pfx: Buffer, senha: string): https.Agent {
  return new https.Agent({
    pfx,
    passphrase: senha,
    rejectUnauthorized: false,
    minVersion: "TLSv1.2",
    keepAlive: true, // reusa a conexão mTLS nas 3 chamadas (/token, /gerar, declaração)
  });
}

// Token JWT do /token com cache de 55min (evita 1 ida mTLS por emissão).
let tokenCache: { token: string; exp: number } | null = null;

// IdOperacaoTransporte via /token + /gerar (sem DLL). O /gerar retorna
// {"Sucesso":true,"Dados":{"CIOT":"<12 chars>"}} e esse CIOT É o
// IdOperacaoTransporte da declaração (regra B16; confirmado contra a
// implementação de referência). Body do /token é literal "{}" e a chave
// vai no HEADER; campo do /gerar é `cpfCnpj` (camelCase, do contratante).
export async function gerarIdOperacaoAntt(
  agent: https.Agent,
  base: string,
  cnpjContratante: string,
): Promise<string> {
  const genBase = base.replace(/\/api$/, "");
  if (!tokenCache || Date.now() >= tokenCache.exp) {
    const t = await postJson({ agent, base: genBase, path: "/token", body: "{}", headers: { chave: apiKeyDecodificada() } });
    const token = String(t.json?.token || "");
    if (t.status < 200 || t.status >= 300 || !token)
      throw new Error(`ANTT /token falhou (HTTP ${t.status}): ${t.text.slice(0, 200)}`);
    tokenCache = { token, exp: Date.now() + 55 * 60 * 1000 };
  }
  const g = await postJson({
    agent,
    base: genBase,
    path: "/gerar",
    body: { cpfCnpj: soDig(cnpjContratante) },
    headers: { Authorization: `Bearer ${tokenCache.token}` },
  });
  if (g.json?.Sucesso === false)
    throw new Error(`ANTT /gerar rejeitou: ${JSON.stringify(g.json?.Mensagem || g.json?.Erros || g.json).slice(0, 300)}`);
  // /gerar retorna {"Sucesso":true,"Dados":{"CIOT":"<12 chars>"}} — esse
  // CIOT é o IdOperacaoTransporte que vai na DeclaracaoOperacaoTransporte.
  const idOp = String(
    g.json?.Dados?.CIOT ||
      g.json?.CIOT ||
      g.json?.Dados?.IdOperacaoTransporte ||
      g.json?.IdOperacaoTransporte ||
      g.json?.Dados?.idOperacaoTransporte ||
      g.json?.idOperacaoTransporte ||
      g.json?.Dados?.ciot ||
      g.json?.ciot ||
      "",
  ).trim();
  if (idOp) return idOp;
  throw new Error(`ANTT /gerar sem CIOT/IdOperacao: ${g.text.slice(0, 300)}`);
}

function codigoOk(json: any): { codigo: string; mensagem: string; protocolo: string } {
  const rawC = json?.Codigo ?? json?.codigo ?? "";
  const codigo = String(Array.isArray(rawC) ? rawC[0] : rawC);
  const rawM = json?.Mensagem ?? json?.mensagem ?? "";
  const mensagem = String(Array.isArray(rawM) ? rawM[0] : rawM);
  const protocolo = String(json?.Protocolo ?? json?.protocolo ?? "");
  return { codigo, mensagem, protocolo };
}

export type FrotaAnttArgs = {
  pfx: Buffer;
  senha: string;
  env: AnttEnv;
  interessadoDoc: string;
  transportadorDoc: string;
  rntrc: string;
  placas: string[];
};

// Endpoints 01 (situação) + 02 (frota) do DCS: diagnóstico direto — dizem se
// a ANTT conhece o RNTRC e cada placa em homologação, antes de declarar.
export async function consultarFrotaAntt(args: FrotaAnttArgs): Promise<{
  situacao: any;
  frota: any;
}> {
  const base = ANTT_BASE[args.env];
  const agent = agentMtls(args.pfx, args.senha);
  const sit = await postJson({
    agent,
    base,
    path: "/ConsultarSituacaoTransportador",
    body: {
      CpfCnpjInteressado: soDig(args.interessadoDoc),
      CpfCnpjTransportador: soDig(args.transportadorDoc),
      RNTRCTransportador: padRntrc9(args.rntrc),
    },
  });
  const fro = await postJson({
    agent,
    base,
    path: "/ConsultarFrotaTransportador",
    body: {
      CpfCnpjInteressado: soDig(args.interessadoDoc),
      CpfCnpjTransportador: soDig(args.transportadorDoc),
      RNTRCTransportador: padRntrc9(args.rntrc),
      Placas: (args.placas || []).map((p) => String(p || "").toUpperCase()),
    },
  });
  return { situacao: sit.json, frota: fro.json };
}

// Endpoint 08 do DCS: consulta a situação de um CIOT de 12 dígitos.
// Se existir declaração vinculada, retorna o CIOT16 (12 + 4 verificador).
export async function consultarCiotGeradoAntt(args: {
  pfx: Buffer;
  senha: string;
  env: AnttEnv;
  codigo12: string;
  ano?: number;
}): Promise<any> {
  const base = ANTT_BASE[args.env];
  const agent = agentMtls(args.pfx, args.senha);
  const body: Record<string, unknown> = { CodigoIdentificacaoOperacao: soDig(args.codigo12) };
  if (args.ano) body.AnoDeclaracao = Number(args.ano);
  const r = await postJson({ agent, base, path: "/ConsultarCIOTGerado", body });
  return r.json;
}

// Fluxo completo: B115 → IdOperacao → DeclaracaoOperacaoTransporte.
export async function declararCiotAntt(args: {
  pfx: Buffer;
  senha: string;
  env: AnttEnv;
  certCnpj: string;
  input: DeclaracaoCiotInput;
}): Promise<CiotResultado> {
  const b115 = b115Ok(args.certCnpj, args.input.contratado.doc);
  if (!b115.ok) {
    return {
      sucesso: false,
      codigo: "B115",
      mensagem: b115.motivo,
      protocolo: "",
      idOperacao: "",
      ciotCodigo: "",
      ciotVerificador: "",
      ciotCompleto: "",
      aviso: "",
    };
  }
  const base = ANTT_BASE[args.env];
  const agent = agentMtls(args.pfx, args.senha);
  const idOperacao =
    args.input.idOperacao && args.input.idOperacao.length === 12
      ? args.input.idOperacao
      : await gerarIdOperacaoAntt(agent, base, args.input.contratante.doc);
  const payload = buildDeclaracaoPayload(args.input, idOperacao);
  const r = await postJson({ agent, base, path: "/DeclaracaoOperacaoTransporte", body: payload });
  if (!r.json) {
    return {
      sucesso: false,
      codigo: `HTTP_${r.status}`,
      mensagem: `ANTT sem resposta JSON (HTTP ${r.status}): ${r.text.slice(0, 300)}`,
      protocolo: "",
      idOperacao,
      ciotCodigo: "",
      ciotVerificador: "",
      ciotCompleto: "",
      aviso: "",
    };
  }
  const { codigo, mensagem, protocolo } = codigoOk(r.json);
  const ok = CODIGOS_SUCESSO.has(codigo);
  const cod = String(r.json?.CodigoIdentificacaoOperacao ?? r.json?.IdOperacaoTransporte ?? "");
  const ver = String(r.json?.CodigoVerificador ?? "");
  return {
    sucesso: ok,
    codigo,
    mensagem,
    protocolo,
    idOperacao,
    ciotCodigo: cod,
    ciotVerificador: ver,
    ciotCompleto: cod && ver ? cod + ver : cod || idOperacao,
    aviso: String(r.json?.AvisoTransportador ?? ""),
  };
}
