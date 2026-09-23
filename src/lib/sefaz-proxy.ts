/**
 * Handler do proxy SEFAZ — roda no Vercel (Node.js com mTLS).
 * Chamado pelo src/server.ts quando a request é POST /api/sefaz.
 * Não usa h3/Nitro — apenas Web standard APIs (Request/Response).
 */

import { createClient } from "@supabase/supabase-js";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos

export async function handleSefazProxy(request: Request): Promise<Response> {
  try {
    const authHeader = request.headers.get("Authorization");
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!authHeader || authHeader !== `Bearer ${serviceKey}`) {
      return json({ error: "Não autorizado" }, 401);
    }

    const body = await request.json();
    const { action, empresaId } = body;

    if (!action || !empresaId) {
      return json({ error: "action e empresaId são obrigatórios" }, 400);
    }

    const supabase = createServiceClient();

    // Buscar certificado ativo
    const { data: cert, error: certErr } = await supabase
      .from("certificados_digitais")
      .select("id, arquivo_path, senha_cript")
      .eq("empresa_id", empresaId)
      .eq("ativo", true)
      .single();

    if (certErr || !cert) {
      return json({ error: "Nenhum certificado ativo encontrado" }, 404);
    }

    console.log("[sefaz-proxy] cert path:", cert.arquivo_path);

    // Download do certificado
    const { data: fileData, error: dlErr } = await supabase.storage
      .from("certificados")
      .download(cert.arquivo_path);

    if (dlErr || !fileData) {
      console.error("[sefaz-proxy] storage download error:", JSON.stringify(dlErr));
      return json({ error: `Falha ao baixar certificado: ${dlErr?.message || "unknown"}` }, 500);
    }

    const pfxBytes = Buffer.from(await fileData.arrayBuffer());
    const first2 = pfxBytes.slice(0, 2).toString("hex");
    const first4 = pfxBytes.slice(0, 4).toString("hex");
    console.log("[sefaz-proxy] PFX bytes:", pfxBytes.length, "header:", first4);

    if (pfxBytes.length < 100) {
      console.error("[sefaz-proxy] PFX muito pequeno — provavelmente não é um certificado válido");
      return json({ error: "Arquivo de certificado inválido (tamanho muito pequeno)" }, 500);
    }
    if (first2 !== "3082" && first2 !== "0482" && first2 !== "3080") {
      const preview = pfxBytes.slice(0, 200).toString("utf8");
      console.error("[sefaz-proxy] PFX header inesperado:", first4, "preview:", preview);
      if (preview.includes("<!") || preview.includes("<html")) {
        return json({ error: "Storage retornou HTML em vez do certificado — verifique as permissões do bucket" }, 500);
      }
      return json({ error: `Formato de certificado inválido (header: ${first4})` }, 500);
    }

    const senha = cert.senha_cript;

    if (!senha) {
      return json({ error: "Senha do certificado não encontrada" }, 500);
    }

    // Buscar empresa
    const { data: empresa } = await supabase
      .from("empresas")
      .select("cnpj, uf")
      .eq("id", empresaId)
      .single();

    const cnpj = empresa?.cnpj || "";
    const uf = empresa?.uf || "SP";

    // Buscar config fiscal da empresa (ambiente + last_nsu + last_query_at)
    const { data: nfeConfig } = await supabase
      .from("nfe_config")
      .select("ambiente, last_nsu, last_query_at")
      .eq("empresa_id", empresaId)
      .maybeSingle();

    const ambiente = nfeConfig?.ambiente === "homologacao" ? "homologacao" : "producao";
    const startNsu = nfeConfig?.last_nsu || undefined;
    console.log("[sefaz-proxy] ambiente:", ambiente, "cnpj:", cnpj, "uf:", uf, "startNsu:", startNsu || "(zero)");

    // Cooldown: verificar se já passou o tempo mínimo entre consultas
    if (action === "consultar" && nfeConfig?.last_query_at) {
      const lastQuery = new Date(nfeConfig.last_query_at).getTime();
      const elapsed = Date.now() - lastQuery;
      if (elapsed < COOLDOWN_MS) {
        const remainingMin = Math.ceil((COOLDOWN_MS - elapsed) / 60000);
        console.log("[sefaz-proxy] cooldown ativo, restam ~", remainingMin, "minutos");
        return json({
          notas: [],
          maxNsuObtido: startNsu,
          resetouCursor: false,
          cooldown: true,
          cooldownMinutos: remainingMin,
          debug: {
            cStat: "656",
            xMotivo: `Cooldown entre consultas — aguarde ${remainingMin} minuto(s)`,
            endpoint: "",
            tpAmb: ambiente === "producao" ? "1" : "2",
            cUFAutor: "",
            cnpj,
          },
        });
      }
    }

    // Import dinâmico de sefaz (usa node:https — só funciona no Node.js)
    const { consultarDestinatario, enviarEventoManifestacao, emitirNFe, consultarPorChave } = await import("@/lib/sefaz");

    let result: unknown;

    switch (action) {
      case "emitirCte": {
        const { buildCteXml, emitirCte } = await import("@/lib/sefaz-cte");
        const { createClient: createClient2 } = await import("@supabase/supabase-js");
        const supa2 = createClient2(process.env.SUPABASE_URL||"", process.env.SUPABASE_SERVICE_ROLE_KEY||"");
        const { data: emp } = await supa2.from("empresas").select("cnpj, uf, ie, razao_social, nome_fantasia, logradouro, numero, complemento, bairro, cidade, cep, regime_tributario").eq("id", empresaId).single();
        const inp = (body as any).input || {};
        const cteAmbiente = inp.ambiente === "homologacao" ? "homologacao" : ambiente;
        const { data: ultimos } = await supa2.from("cte_documentos").select("numero").eq("empresa_id", empresaId).eq("ambiente", cteAmbiente).order("created_at",{ascending:false}).limit(50);
        const baseNum = Math.max(0, ...(((ultimos as any[]) || []).map(r => parseInt((r as any)?.numero || "0", 10) || 0)));
        const proximo = cteAmbiente === "homologacao" ? String(Math.max(baseNum + 1, 500)) : String(baseNum + 1);
        const cli = inp.emit || {};
        const emitCnpj = cli.cnpj || emp?.cnpj || "";
        const emitUf = emp?.uf || cli.uf || uf;
        console.log("[CTE-PROXY-DEBUG] empCnpj:", emp?.cnpj, "empUf:", emp?.uf, "emitCnpj:", emitCnpj, "emitUf:", emitUf, "ambiente:", cteAmbiente);
        const input = { ...inp, ambiente: cteAmbiente, numero: proximo, serie: inp.serie || "1", emit: {
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
        console.log("[CTE-PROXY-DEBUG] tomador xNome:", input.tomador?.xNome, "CNPJ:", input.tomador?.cnpj);
        console.log("[CTE-PROXY-DEBUG] XML gerado:", xml);
        const ret = await emitirCte(pfxBytes, senha, xml, cteAmbiente, emitUf);
        const supa3 = createClient(process.env.SUPABASE_URL||"", process.env.SUPABASE_SERVICE_ROLE_KEY||"");
        if (ret.sucesso) await supa3.from("cte_documentos").insert({ empresa_id: empresaId, chave_acesso: chave, numero: proximo, serie: input.serie, status: "autorizado", xml_assinado: JSON.stringify({ xml, form: (body as any).form || {} }), protocolo_sefaz: ret.protocolo, ambiente: cteAmbiente, data_autorizacao: new Date().toISOString(), valor_servico: input.vPrest, peso_carga: Number((input as any).pesoKg ?? (body as any)?.form?.peso ?? 0) || null } as any);
        else await supa3.from("cte_documentos").insert({ empresa_id: empresaId, chave_acesso: chave, numero: proximo, serie: input.serie, status: "rejeitado", xml_assinado: xml, motivo_rejeicao: ret.xMotivo, ambiente: cteAmbiente } as any);
        if (ret.sucesso) {
          const chUsadas = ((inp as any).chavesNFe || []).map((c: any) => String(c).replace(/\D/g, "")).filter(Boolean);
          if (chUsadas.length > 0) await supa3.from("cte_nfes_pendentes" as any).update({ status: "embarcada" }).in("chave", chUsadas).eq("empresa_id", empresaId);
        }
        return json({ ...ret, chave, xml });
      }
      case "consultarCte": {
        const { consultarCte } = await import("@/lib/sefaz-cte");
        result = await consultarCte(pfxBytes, senha, (body as any).chave, (((body as any).ambiente === "homologacao" || (body as any).ambiente === "producao") ? (body as any).ambiente : ambiente), uf);
        break;
      }
      case "consultarCteChave": {
        const { consultarCtePorChave } = await import("@/lib/sefaz-cte");
        result = await consultarCtePorChave(pfxBytes, senha, (body as any).chave, ambiente, cnpj, uf);
        break;
      }
      case "cancelarCte": {
        const { cancelarCte } = await import("@/lib/sefaz-cte");
        let ambCanc = (((body as any).ambiente === "homologacao" || (body as any).ambiente === "producao") ? (body as any).ambiente : ambiente);
        if (!(body as any).ambiente) {
          const { data: docAmb } = await supabase.from("cte_documentos").select("ambiente").eq("chave_acesso", String((body as any).chave || "")).maybeSingle();
          if ((docAmb as any)?.ambiente === "homologacao" || (docAmb as any)?.ambiente === "producao") ambCanc = (docAmb as any).ambiente;
        }
        console.log("[CTE-CANCEL] ambiente resolvido:", ambCanc);
        result = await cancelarCte(pfxBytes, senha, (body as any).chave, (body as any).justificativa, ambCanc, cnpj, uf, (body as any).protocolo);
        if ((result as any).sucesso) {
          const { createClient: cc } = await import("@supabase/supabase-js");
          const s = cc(process.env.SUPABASE_URL||"", process.env.SUPABASE_SERVICE_ROLE_KEY||"");
          await s.from("cte_documentos").update({ status: "cancelado" } as any).eq("chave_acesso", (body as any).chave);
          const { data: docXml } = await s.from("cte_documentos").select("xml_assinado").eq("chave_acesso", (body as any).chave).maybeSingle();
          let xmlStr = (docXml as any)?.xml_assinado || "";
          try { const p = JSON.parse(xmlStr); if (p.xml) xmlStr = p.xml; } catch {}
          const chavesNfe = [...xmlStr.matchAll(/<chNFe>(\d{44})<\/chNFe>/g)].map(m => m[1]);
          if (chavesNfe.length > 0) await s.from("cte_nfes_pendentes" as any).update({ status: "pendente" }).in("chave", chavesNfe).eq("empresa_id", empresaId);
        }
        return json(result);
      }
      case "emitirMdf": {
        const { emitirMdf } = await import("@/lib/sefaz-mdf");
        const b = body as any;
        const ambMdf = "homologacao" as const; // MDF-e travado em homologação (23/09/2026)
        const retMdf = await emitirMdf(pfxBytes, senha, b.xml, ambMdf);
        const { createClient: ccMdf } = await import("@supabase/supabase-js");
        const sMdf = ccMdf(process.env.SUPABASE_URL||"", process.env.SUPABASE_SERVICE_ROLE_KEY||"");
        if ((retMdf as any).sucesso && (retMdf as any).chave) {
          await sMdf.from("mdf_documentos").upsert({ empresa_id: empresaId, chave_acesso: (retMdf as any).chave, status: "autorizado", protocolo_sefaz: (retMdf as any).protocolo || null, veiculo_tracao_id: b.veiculoTracaoId || null, motorista_id: b.motoristaId || null, uf_carregamento: b.ufCarregamento, uf_descarregamento: b.ufDescarregamento, qtd_cte: b.qtdCtes, valor_total_carga: b.valorTotalCarga, peso_total: b.pesoTotal, ambiente: ambMdf, data_autorizacao: new Date().toISOString(), xml_assinado: JSON.stringify({ xml: b.xml, percursoUFs: b.percursoUFs || [], observacoes: b.observacoes || "", infoFisco: b.infoFisco || "", tipoMdf: b.tipoMdf || "Normal", isTransbordo: !!b.isTransbordo, transbordos: [b.transbordo1, b.transbordo2, b.transbordo3].filter(Boolean) }) } as never, { onConflict: "chave_acesso" });
        } else if ((retMdf as any).cStat) {
          const numero = String(b.xml || "").match(/<nMDF>(\d+)<\/nMDF>/)?.[1] || "";
          const serie = String(b.xml || "").match(/<serie>(\d+)<\/serie>/)?.[1] || "1";
          await sMdf.from("mdf_documentos").insert({ empresa_id: empresaId, numero, serie, status: "rejeitado", motivo_rejeicao: `${(retMdf as any).cStat} - ${(retMdf as any).xMotivo}`, uf_carregamento: b.ufCarregamento, uf_descarregamento: b.ufDescarregamento, qtd_cte: b.qtdCtes, valor_total_carga: b.valorTotalCarga, peso_total: b.pesoTotal, ambiente: ambMdf, xml_assinado: b.xml } as never);
        }
        return json(retMdf);
      }
      case "encerrarMdf": {
        const { encerrarMdf } = await import("@/lib/sefaz-mdf");
        const b = body as any;
        const retEnc = await encerrarMdf(pfxBytes, senha, b.chave, "homologacao", b.cnpj || cnpj, b.uf || uf);
        if ((retEnc as any).sucesso) {
          const { createClient: ccEnc } = await import("@supabase/supabase-js");
          const sEnc = ccEnc(process.env.SUPABASE_URL||"", process.env.SUPABASE_SERVICE_ROLE_KEY||"");
          await sEnc.from("mdf_documentos").update({ status: "encerrado", data_encerramento: new Date().toISOString() } as never).eq("chave_acesso", b.chave);
        }
        return json(retEnc);
      }
      case "cancelarMdf": {
        const { cancelarMdf } = await import("@/lib/sefaz-mdf");
        const b = body as any;
        const retCanc = await cancelarMdf(pfxBytes, senha, b.chave, b.justificativa, "homologacao", b.cnpj || cnpj, b.uf || uf);
        if ((retCanc as any).sucesso) {
          const { createClient: ccCanc } = await import("@supabase/supabase-js");
          const sCanc = ccCanc(process.env.SUPABASE_URL||"", process.env.SUPABASE_SERVICE_ROLE_KEY||"");
          await sCanc.from("mdf_documentos").update({ status: "cancelado" } as never).eq("chave_acesso", b.chave);
        }
        return json(retCanc);
      }
      case "consultar": {
        // Buscar last_query_at atual ANTES de consultar
        const { data: configAntes } = await supabase
          .from("nfe_config")
          .select("last_query_at")
          .eq("empresa_id", empresaId)
          .maybeSingle();
        const lastQueryAntes = configAntes?.last_query_at;

        result = await consultarDestinatario(pfxBytes, senha, cnpj, uf, ambiente, startNsu);
        const r = result as { maxNsuObtido?: string; debug?: { cStat?: string } };

        if (r.debug?.cStat === "138" || r.debug?.cStat === "137") {
          // Sucesso: atualizar last_query_at e last_nsu
          const now = new Date().toISOString();
          await supabase.from("nfe_config").update({ last_query_at: now }).eq("empresa_id", empresaId);
          if (r.maxNsuObtido) {
            await supabase.from("nfe_config").update({ last_nsu: r.maxNsuObtido }).eq("empresa_id", empresaId);
          }
        } else if (r.debug?.cStat === "656") {
          // Consumo Indevido: SEFAZ pede 1h + usar ultNSU — salva para respeitar cooldown e avançar cursor
          const now = new Date().toISOString();
          const ult = (r as any).ultNSU || (r as any).maxNsuObtido;
          const upd: Record<string, unknown> = { last_query_at: now };
          if (ult) upd.last_nsu = ult;
          await supabase.from("nfe_config").update(upd).eq("empresa_id", empresaId);
          (r as Record<string, unknown>).lastQueryAt = lastQueryAntes;
        }
        // outros erros: NÃO atualizar last_query_at — timer conta da última sucesso
        break;
      }
      case "manifestar":
        result = await enviarEventoManifestacao(
          pfxBytes, senha, body.chave, body.tipoEvento, cnpj, uf, ambiente, body.justificativa,
        );
        break;
      case "emitir":
        result = await emitirNFe(pfxBytes, senha, body.xml, uf, ambiente);
        break;
      case "consultarChave":
        result = await consultarPorChave(pfxBytes, senha, body.chave, cnpj, uf, ambiente);
        break;
      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400);
    }

    return json(result);
  } catch (err) {
    console.error("[sefaz-proxy]", err);
    return json({ error: String(err) }, 500);
  }
}

