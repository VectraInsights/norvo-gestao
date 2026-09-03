import { createServerFn } from "@tanstack/react-start";
const SEFAZ_URL = (() => { try { const imp = typeof import.meta !== "undefined" ? (import.meta as any).env : undefined; const a = imp?.SEFAZ_URL || imp?.VITE_SEFAZ_URL || ""; const b = typeof process !== "undefined" ? (process.env.SEFAZ_URL || process.env.VITE_SEFAZ_URL || "") : ""; return a || b; } catch { return ""; } })();
async function callProxy(action: string, body: Record<string, unknown>) {
  const res = await fetch(SEFAZ_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY || ""}` }, body: JSON.stringify({ action, ...body }) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: `HTTP ${res.status}` }))).error);
  return res.json();
}
export const emitirCteFn = createServerFn({ method: "POST" }).validator((d: { empresaId: string; input: any }) => d).handler(async ({ data }) => {
  if (SEFAZ_URL) return callProxy("emitirCte", data);
  const { buscarCertificadoAtivo, buildCteXml, emitirCte } = await import("@/lib/sefaz-cte");
  const cert = await buscarCertificadoAtivo(data.empresaId);
  const { createClient } = await import("@supabase/supabase-js");
  const supa = createClient(process.env.SUPABASE_URL||"", process.env.SUPABASE_SERVICE_ROLE_KEY||"");
  const { data: emp } = await supa.from("empresas").select("cnpj, uf, ie, nome_fantasia, razao_social, logradouro, numero, bairro, cidade, cep, regime_tributario").eq("id", data.empresaId).single();
  const { data: cfg } = await supa.from("nfe_config").select("ambiente").eq("empresa_id", data.empresaId).maybeSingle();
  const ambiente = cfg?.ambiente==="homologacao"?"homologacao":"producao";
  const { data: ultimo } = await supa.from("cte_documentos").select("numero").eq("empresa_id", data.empresaId).order("created_at",{ascending:false}).limit(1).maybeSingle();
  const proximo = String((parseInt((ultimo as any)?.numero || "0",10)+1));
  const cli = data.input.emit || {};
  const emitCnpj = emp?.cnpj || cli.cnpj || "";
  const emitUf = emp?.uf || cli.uf || "MG";
  console.log("[CTE-DEBUG] empCnpj:", emp?.cnpj, "empUf:", emp?.uf, "emitCnpj:", emitCnpj, "emitUf:", emitUf);
  console.log("[CTE-DEBUG] emp Completo:", JSON.stringify(emp));
  console.log("[CTE-DEBUG] input原始:", JSON.stringify(data.input));
  console.log("[CTE-DEBUG] Toma from input:", JSON.stringify(data.input?.tomador));
  console.log("[CTE-DEBUG] Endereco from input:", JSON.stringify({ logradouro: data.input?.tomador?.logradouro, nro: data.input?.tomador?.nro, bairro: data.input?.tomador?.bairro, cep: data.input?.tomador?.cep }));
  const input = { ...data.input, ambiente, numero: proximo, serie: data.input.serie || "1", emit: {
    cnpj: emitCnpj,
    xNome: cli.xNome || emp?.razao_social || emp?.nome_fantasia || "EMITENTE",
    ie: cli.ie || emp?.ie || "ISENTO",
    uf: emitUf,
    cMun: cli.cMun || "3106200",
    xMun: cli.xMun || emp?.cidade || "BELO HORIZONTE",
    crt: cli.crt || emp?.regime_tributario || "3",
    logradouro: cli.logradouro || emp?.logradouro || "RUA",
    nro: cli.nro || emp?.numero || "SN",
    complemento: cli.complemento || emp?.complemento || "",
    bairro: cli.bairro || emp?.bairro || "CENTRO",
    cep: cli.cep || emp?.cep || "00000000",
  } };
  const { xml, chave } = buildCteXml(input);
  console.log("[CTE-DEBUG] XML gerado:", xml);
  console.log("[CTE-DEBUG] Toma input:", JSON.stringify(input.tomador));
  console.log("[CTE-DEBUG] Emit input:", JSON.stringify(input.emit));
  const ret = await emitirCte(cert.pfx, cert.senha, xml, ambiente, cert.uf);
  if (ret.sucesso) {
    await supa.from("cte_documentos").insert({ empresa_id: data.empresaId, chave_acesso: chave, numero: proximo, serie: input.serie, status: "autorizado", xml_assinado: xml, protocolo_sefaz: ret.protocolo, ambiente, data_autorizacao: new Date().toISOString(), valor_servico: input.vPrest, peso_carga: input.pesoKg } as any);
  } else {
    await supa.from("cte_documentos").insert({ empresa_id: data.empresaId, chave_acesso: chave, numero: proximo, serie: input.serie, status: "rejeitado", xml_assinado: xml, motivo_rejeicao: ret.xMotivo, ambiente } as any);
  }
  return { ...ret, chave, xml };
});
export const consultarCteFn = createServerFn({ method: "POST" }).validator((d:{empresaId:string;chave:string})=>d).handler(async ({data})=>{
  if(SEFAZ_URL) return callProxy("consultarCte", data);
  const { buscarCertificadoAtivo, consultarCte } = await import("@/lib/sefaz-cte");
  const cert=await buscarCertificadoAtivo(data.empresaId);
  const { createClient }=await import("@supabase/supabase-js");
  const supa=createClient(process.env.SUPABASE_URL||"",process.env.SUPABASE_SERVICE_ROLE_KEY||"");
  const { data: cfg}=await supa.from("nfe_config").select("ambiente").eq("empresa_id",data.empresaId).maybeSingle();
  const ambiente=cfg?.ambiente==="homologacao"?"homologacao":"producao";
  return consultarCte(cert.pfx, cert.senha, data.chave, ambiente, cert.uf);
});
export const previewCteXmlFn = createServerFn({ method: "POST" }).validator((d: { empresaId: string; input: any }) => d).handler(async ({ data }) => {
  const { buildCteXml } = await import("@/lib/sefaz-cte");
  const { createClient } = await import("@supabase/supabase-js");
  const supa = createClient(process.env.SUPABASE_URL||"", process.env.SUPABASE_SERVICE_ROLE_KEY||"");
  const { data: emp } = await supa.from("empresas").select("cnpj, uf, ie, nome_fantasia, razao_social, logradouro, numero, complemento, bairro, cidade, cep, regime_tributario").eq("id", data.empresaId).single();
  const { data: cfg } = await supa.from("nfe_config").select("ambiente").eq("empresa_id", data.empresaId).maybeSingle();
  const ambiente = cfg?.ambiente==="homologacao"?"homologacao":"producao";
  const { data: ultimo } = await supa.from("cte_documentos").select("numero").eq("empresa_id", data.empresaId).order("created_at",{ascending:false}).limit(1).maybeSingle();
  const proximo = String((parseInt((ultimo as any)?.numero || "0",10)+1));
  const cli = data.input.emit || {};
  const emitCnpj = emp?.cnpj || cli.cnpj || "";
  const emitUf = emp?.uf || cli.uf || "MG";
  const input = { ...data.input, ambiente, numero: proximo, serie: data.input.serie || "1", emit: {
    cnpj: emitCnpj,
    xNome: cli.xNome || emp?.razao_social || emp?.nome_fantasia || "EMITENTE",
    ie: cli.ie || emp?.ie || "ISENTO",
    uf: emitUf,
    cMun: cli.cMun || "3106200",
    xMun: cli.xMun || emp?.cidade || "BELO HORIZONTE",
    crt: cli.crt || emp?.regime_tributario || "3",
    logradouro: cli.logradouro || emp?.logradouro || "RUA",
    nro: cli.nro || emp?.numero || "SN",
    complemento: cli.complemento || emp?.complemento || "",
    bairro: cli.bairro || emp?.bairro || "CENTRO",
    cep: cli.cep || emp?.cep || "00000000",
  } };
  const { xml, chave } = buildCteXml(input);
  return { xml, chave, proximo, ambiente, form: data.input };
});

export const cancelarCteFn = createServerFn({ method: "POST" }).validator((d:{empresaId:string;chave:string;justificativa:string})=>d).handler(async ({data})=>{
  if(SEFAZ_URL) return callProxy("cancelarCte", data);
  const { buscarCertificadoAtivo, cancelarCte } = await import("@/lib/sefaz-cte");
  const cert=await buscarCertificadoAtivo(data.empresaId);
  const { createClient }=await import("@supabase/supabase-js");
  const supa=createClient(process.env.SUPABASE_URL||"",process.env.SUPABASE_SERVICE_ROLE_KEY||"");
  const { data: cfg}=await supa.from("nfe_config").select("ambiente").eq("empresa_id",data.empresaId).maybeSingle();
  const ambiente=cfg?.ambiente==="homologacao"?"homologacao":"producao";
  const ret=await cancelarCte(cert.pfx, cert.senha, data.chave, data.justificativa, ambiente, cert.cnpj, cert.uf);
  if(ret.sucesso) await supa.from("cte_documentos").update({status:"cancelado"} as any).eq("chave_acesso",data.chave);
  return ret;
});

export const excluirRejeitadosCteFn = createServerFn({ method: "POST" }).validator((d:{empresaId:string})=>d).handler(async ({data})=>{
  const { createClient }=await import("@supabase/supabase-js");
  const supa=createClient(process.env.SUPABASE_URL||"",process.env.SUPABASE_SERVICE_ROLE_KEY||"");
  const { error }=await supa.from("cte_documentos" as any).delete().eq("empresa_id",data.empresaId).eq("status","rejeitado");
  if(error) throw new Error(error.message);
  return { ok:true };
});
