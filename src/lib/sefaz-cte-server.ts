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
  const ambiente = (data.input as any).ambiente === "homologacao" ? "homologacao" : (cfg?.ambiente==="homologacao"?"homologacao":"producao");
  const { data: ultimo } = await supa.from("cte_documentos").select("numero").eq("empresa_id", data.empresaId).order("numero",{ascending:false}).limit(1).maybeSingle();
  const baseNum = parseInt((ultimo as any)?.numero || "0",10);
  const proximo = String(baseNum >= 900000 ? baseNum + 1 : Math.max(baseNum + 1, 900000));
  const cli = data.input.emit || {};
  const form = (data.input as any).form || {};
  const emitCnpj = emp?.cnpj || cli.cnpj || "";
  const emitUf = emp?.uf || cli.uf || "MG";
  console.log("[CTE-DEBUG] empCnpj:", emp?.cnpj, "empUf:", emp?.uf, "emitCnpj:", emitCnpj, "emitUf:", emitUf, "ambiente:", ambiente);
  console.log("[CTE-DEBUG] form:", JSON.stringify(form));
  const input = { ...data.input, ambiente, numero: proximo, serie: data.input.serie || "1",
    cfop: data.input.cfop || form.cfop || "6352",
    vPrest: Number(data.input.vPrest || form.vPrest || 0),
    vCarga: Number(data.input.vCarga || form.vCarga || 0),
    pesoKg: Number(data.input.pesoKg || form.peso || 0),
    cMunEnv: data.input.cMunEnv || form.cMunEnv || "3106209",
    xMunEnv: data.input.xMunEnv || form.xMunEnv || "FORMIGA",
    ufEnv: data.input.ufEnv || form.ufEnv || "MG",
    cMunIni: data.input.cMunIni || form.cMunIni || "3106209",
    xMunIni: data.input.xMunIni || form.xMunIni || "FORMIGA",
    ufIni: data.input.ufIni || form.ufIni || "MG",
    cMunFim: data.input.cMunFim || form.cMunFim || "3106209",
    xMunFim: data.input.xMunFim || form.xMunFim || "FORMIGA",
    ufFim: data.input.ufFim || form.ufFim || "MG",
    chavesNFe: data.input.chavesNFe || [],
    tomador: data.input.tomador || {
      toma: form.toma || "0",
      cnpj: (form.cnpjTomador || "").replace(/\D/g,""),
      xNome: form.xNomeTomador || "",
      ie: form.ieTomador || "",
      uf: form.ufTomador || "MG",
      cMun: form.cMunTomador || "3106209",
      xMun: form.xMunTomador || "",
      cep: form.cepTomador || "",
      logradouro: form.logradouroTomador || "",
      nro: form.nroTomador || "",
      bairro: form.bairroTomador || "",
      fone: form.foneTomador || "",
      email: form.emailTomador || "",
    },
    emit: {
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
    },
    modalRod: data.input.modalRod || { rntrc: form.rntrc || "ISENTO" },
    icms: data.input.icms || { CST: form.icmsCST || "00", vBC: Number(form.icmsBase || 0), pICMS: Number(form.icmsAliq || 7), vICMS: Number(form.icmsValor || 0) },
  };
  console.log("[CTE-DEBUG] tomador:", JSON.stringify(input.tomador));
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
  const ambiente = (data.input as any).ambiente === "homologacao" ? "homologacao" : (cfg?.ambiente==="homologacao"?"homologacao":"producao");
  const { data: ultimo } = await supa.from("cte_documentos").select("numero").eq("empresa_id", data.empresaId).order("numero",{ascending:false}).limit(1).maybeSingle();
  const baseNum = parseInt((ultimo as any)?.numero || "0",10);
  const proximo = String(baseNum >= 900000 ? baseNum + 1 : Math.max(baseNum + 1, 900000));
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

export const cancelarCteFn = createServerFn({ method: "POST" }).validator((d:{empresaId:string;chave:string;justificativa:string;protocolo?:string})=>d).handler(async ({data})=>{
  if(SEFAZ_URL) return callProxy("cancelarCte", data);
  const { buscarCertificadoAtivo, cancelarCte } = await import("@/lib/sefaz-cte");
  const cert=await buscarCertificadoAtivo(data.empresaId);
  const { createClient }=await import("@supabase/supabase-js");
  const supa=createClient(process.env.SUPABASE_URL||"",process.env.SUPABASE_SERVICE_ROLE_KEY||"");
  const { data:doc }=await supa.from("cte_documentos").select("ambiente").eq("chave_acesso",data.chave).maybeSingle();
  const ambiente=(doc as any)?.ambiente==="producao"?"producao":"homologacao";
  console.log("[CTE-CANCEL] ambiente:", ambiente, "chave:", data.chave, "protocolo:", data.protocolo);
  const ret=await cancelarCte(cert.pfx, cert.senha, data.chave, data.justificativa, ambiente, cert.cnpj, cert.uf, data.protocolo);
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
