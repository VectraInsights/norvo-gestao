import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Route as RoadIcon, Pencil, Trash2, Search, Save } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { useState, useMemo, useRef, useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/fiscal/percursos")({
  component: PercursosPage,
  head: () => ({ meta: [{ title: "Percursos — Norvo" }] }),
});

type Percurso = Record<string, any> & { id: string };

// Colunas editáveis. Remetente/destinatário/tomador formam a chave e NUNCA entram aqui.
const EDITAVEIS = [
  "nome",
  "coleta_cmun", "coleta_xmun", "coleta_uf",
  "entrega_cmun", "entrega_xmun", "entrega_uf",
  "cfop",
  "consig_cnpj", "consig_nome", "consig_ie", "consig_uf", "consig_xmun", "consig_cep", "consig_logradouro", "consig_nro", "consig_bairro",
  "redesp_cnpj", "redesp_nome", "redesp_ie", "redesp_uf", "redesp_xmun", "redesp_cep", "redesp_logradouro", "redesp_nro", "redesp_bairro",
  "seg_nome", "seg_apolice", "seg_averbacao", "seg_rctr_c", "seg_rcf_dc", "seg_adicional", "seg_total", "seg_repassar", "seg_responsavel",
  "distancia_km", "duracao_horas",
  "pedagio_pagto", "pedagio_operadora", "pedagio_cnpj", "pedagio_tag", "pedagio_vale",
  "icms_cst", "icms_aliq", "reducao_base", "credito_outorgado",
  "pis_aliq", "cofins_aliq", "ir_aliq", "inss_aliq", "csll_aliq",
  "obs_gerais",
];

const fmtDoc = (d: any) => {
  const s = String(d || "").replace(/\D/g, "");
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return s || "—";
};

function T({ label, k, ph, mono, editing, set, on14 }: { label: string; k: string; ph?: string; mono?: boolean; editing: Percurso | null; set: (k: string, v: any) => void; on14?: (digits: string) => void }) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input className={"h-7 text-xs" + (mono ? " font-mono" : "")} value={editing?.[k] ?? ""} onChange={e => { set(k, e.target.value); if (on14 && e.target.value.replace(/\D/g, "").length === 14) on14(e.target.value.replace(/\D/g, "")); }} placeholder={ph} />
    </div>
  );
}
function R({ label, v }: { label: string; v: any }) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input className="h-7 text-xs bg-muted" value={String(v ?? "")} readOnly />
    </div>
  );
}
function Parte({ titulo, nome, doc, ie, lgr, nro, bai, cid, uf, cep, fone }: { titulo: string; nome: string; doc: string; ie: string; lgr: string; nro: string; bai: string; cid: string; uf: string; cep: string; fone: string }) {
  const ender = [lgr && (lgr + (nro ? ", " + nro : "")), bai].filter(Boolean).join(" - ");
  const loc = ((cid || "--") + "-" + (uf || "--")) + (cep ? " - CEP " + cep : "") + (fone ? " - " + fone : "");
  return (
    <div className="border rounded px-2 py-1 bg-muted/20 grid grid-cols-12 gap-x-2 items-center" title={nome}>
      <p className="col-span-3 text-xs truncate"><span className="font-semibold">{titulo}</span><span className="text-[9px] text-muted-foreground"> (chave)</span><span className="font-medium"> {nome}</span></p>
      <p className="col-span-2 text-[11px] text-muted-foreground truncate">CNPJ {fmtDoc(doc)}</p>
      <p className="col-span-1 text-[11px] text-muted-foreground truncate">IE {ie || "ISENTO"}</p>
      <p className="col-span-3 text-[11px] text-muted-foreground truncate">{ender || "--"}</p>
      <p className="col-span-3 text-[11px] text-muted-foreground truncate">{loc}</p>
    </div>
  );
}
function PercursosPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [percTab, setPercTab] = useState("geral");
  const [editing, setEditing] = useState<Percurso | null>(null);

  const { data: percursos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["cte-percursos", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("cte_percursos" as any)
        .select("*").eq("empresa_id", empresa!.id).order("codigo");
      if (error) throw error;
      return (data ?? []) as unknown as Percurso[];
    },
  });

  const { data: contatosCte } = useQuery({
    enabled: !!empresa,
    queryKey: ["contatos-cte", empresa?.id],
    queryFn: async (): Promise<any[]> => {
      const { data } = await supabase.from("contatos" as any).select("id,documento,nome,ie,logradouro,numero,bairro,cidade,uf,cep,telefone").eq("empresa_id", empresa!.id);
      return (data ?? []) as any[];
    },
  });
  const contatoByDoc = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of contatosCte ?? []) if ((c as any).documento) m.set(String((c as any).documento).replace(/\D/g, ""), c);
    return m;
  }, [contatosCte]);
  const salvar = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Nada para salvar");
      const payload: Record<string, any> = {};
      for (const k of EDITAVEIS) payload[k] = editing[k] ?? (k === "seg_repassar" ? false : "");
      for (const p of ["rem", "dest", "toma"]) {
        const c = contatoByDoc.get(String(editing[p + "_cnpj"] || "").replace(/\D/g, "")) || {};
        const fb: Record<string, any> = { ie: c.ie, logradouro: c.logradouro, nro: c.numero, bairro: c.bairro, xmun: c.cidade, uf: c.uf, cep: c.cep, fone: c.telefone };
        for (const k of Object.keys(fb)) { const col = p + "_" + k; if (!payload[col] && fb[k]) payload[col] = fb[k]; }
      }
      const { error } = await supabase.from("cte_percursos" as any).update(payload).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Percurso atualizado");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["cte-percursos", empresa?.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cte_percursos" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Percurso excluído");
      qc.invalidateQueries({ queryKey: ["cte-percursos", empresa!.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Completa endereço/IE com o cadastro de contatos quando o percurso não tem
  const withContato = (p: string) => {
    const c = contatoByDoc.get(String(editing?.[p + "_cnpj"] || "").replace(/\D/g, "")) || {};
    const g = (k: string, ck: string) => editing?.[p + "_" + k] || (c as any)[ck] || "";
    return { ie: g("ie", "ie"), lgr: g("logradouro", "logradouro"), nro: g("nro", "numero"), bai: g("bairro", "bairro"), cid: g("xmun", "cidade"), uf: g("uf", "uf"), cep: g("cep", "cep"), fone: g("fone", "telefone") };
  };
  const eRem = withContato("rem");
  const eDes = withContato("dest");
  const eTom = withContato("toma");
  // Amarracao: prioridade da entrega = redespacho > destinatario
  useEffect(() => {
    if (!editing) return;
    const rx = (editing.redesp_xmun || "").trim();
    const ru = (editing.redesp_uf || "").trim();
    const hasRed = (editing.redesp_cnpj || "").replace(/\D/g, "").length === 14 && (rx || ru);
    const nx = hasRed ? rx : (editing.dest_xmun || "");
    const nu = hasRed ? ru : (editing.dest_uf || "");
    if ((editing.entrega_xmun || "") !== nx || (editing.entrega_uf || "") !== nu) {
      setEditing(e => (e ? { ...e, entrega_xmun: nx, entrega_uf: nu } : e));
    }
  }, [editing?.redesp_cnpj, editing?.redesp_xmun, editing?.redesp_uf, editing?.dest_xmun, editing?.dest_uf]);
  const lastLookupParte = useRef<Record<string, string>>({});
  const lookupParte = async (p: "consig" | "redesp", digits: string) => {
    const d = digits.replace(/\D/g, "").slice(0, 14);
    if (d.length !== 14 || !empresa) return;
    if (lastLookupParte.current[p] === d) return;
    lastLookupParte.current[p] = d;
    try {
      const row = contatoByDoc.get(d);
      let found: any = row ? { nome: row.nome || "", ie: row.ie || "", uf: row.uf || "", cidade: row.cidade || "", cep: String(row.cep || "").replace(/\D/g, ""), logradouro: row.logradouro || "", numero: row.numero || "", bairro: row.bairro || "", fone: row.telefone || "", fromContatos: true, _id: row.id } : null;
      if (!found || !found.logradouro || !found.cidade) {
        let j: any = null;
        for (const url of ["https://brasilapi.com.br/api/cnpj/v1/" + d, "https://receitaws.com.br/v1/cnpj/" + d]) {
          try { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); if (r.ok) { j = await r.json(); break; } } catch {}
        }
        if (j && j.status !== "ERROR") {
          const api = { nome: j.razao_social || j.nome || "", ie: "", uf: j.uf || j.state || "", cidade: j.municipio || j.city || "", cep: String(j.cep || j.zip || "").replace(/\D/g, ""), logradouro: j.logradouro || j.street || "", numero: String(j.numero || j.number || ""), bairro: j.bairro || j.district || "", fone: j.ddd_telefone_1 || j.telefone || j.phone || "" };
          found = { nome: (found && found.nome) || api.nome, ie: (found && found.ie) || "", uf: (found && found.uf) || api.uf, cidade: (found && found.cidade) || api.cidade, cep: (found && found.cep) || api.cep, logradouro: (found && found.logradouro) || api.logradouro, numero: (found && found.numero) || api.numero, bairro: (found && found.bairro) || api.bairro, fone: (found && found.fone) || api.fone, fromContatos: !!(found && found.nome), _id: found && (found as any)._id };
          if (api.cidade || api.logradouro) {
            if (found._id) { await supabase.from("contatos" as any).update({ logradouro: api.logradouro || null, numero: api.numero || null, bairro: api.bairro || null, cidade: api.cidade || null, uf: api.uf || null, cep: api.cep || null, telefone: api.fone || null }).eq("id", found._id); }
            else if (api.nome || api.cidade) { await supabase.from("contatos" as any).insert({ empresa_id: empresa.id, nome: api.nome || d, tipo: "cliente", documento: d, uf: api.uf || null, cidade: api.cidade || null, logradouro: api.logradouro || null, numero: api.numero || null, bairro: api.bairro || null, cep: api.cep || null, telefone: api.fone || null } as any); }
            qc.invalidateQueries({ queryKey: ["contatos-cte", empresa.id] });
          }
        }
      }
      if (!found || (!found.nome && !found.cidade && !found.logradouro)) { toast.error("CNPJ nao encontrado"); return; }
      setEditing(e => e ? { ...e,
        [p + "_nome"]: found.nome || (e as any)[p + "_nome"] || "",
        [p + "_ie"]: found.ie || (e as any)[p + "_ie"] || "",
        [p + "_uf"]: found.uf || (e as any)[p + "_uf"] || "",
        [p + "_xmun"]: found.cidade || (e as any)[p + "_xmun"] || "",
        [p + "_cep"]: found.cep || (e as any)[p + "_cep"] || "",
        [p + "_logradouro"]: found.logradouro || (e as any)[p + "_logradouro"] || "",
        [p + "_nro"]: found.numero || (e as any)[p + "_nro"] || "",
        [p + "_bairro"]: found.bairro || (e as any)[p + "_bairro"] || "",
      } : e);
      toast.success(p === "consig" ? "Consignatario localizado" : "Redespacho localizado");
    } catch (e: any) { toast.error(e.message || "Falha ao buscar CNPJ"); }
  };
  const set = (k: string, v: any) => setEditing((e: any) => (e ? { ...e, [k]: v } : e));
  const q = busca.trim().toLowerCase();
  const lista = (percursos || []).filter(p => {
    if (!q) return true;
    return [p.codigo, p.nome, p.rem_nome, p.rem_cnpj, p.dest_nome, p.dest_cnpj, p.toma_nome, p.toma_cnpj]
      .some(v => String(v || "").toLowerCase().includes(q));
  });

  return (
    <div className="p-6 space-y-4">
      <PageHeader
        eyebrow="Fiscal"
        title="Percursos"
        description="Rotas padronizadas do CT-e (remetente + destinatário + tomador). Aplicadas automaticamente na emissão."
      />

      <div className="flex items-center gap-2 max-w-md">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input className="h-8 text-xs" placeholder="Buscar por código, nome, empresa ou CNPJ..." value={busca} onChange={e => setBusca(e.target.value)} />
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
          ) : lista.length === 0 ? (
            <EmptyState icon={RoadIcon} title="Nenhum percurso" description="Os percursos são criados automaticamente ao emitir CT-e ou salvar rascunho." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Código</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Remetente → Destinatário</TableHead>
                  <TableHead>Tomador</TableHead>
                  <TableHead>Coleta / Entrega</TableHead>
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono">{p.codigo || "—"}</TableCell>
                    <TableCell className="max-w-[260px] truncate" title={p.nome}>{p.nome}</TableCell>
                    <TableCell className="text-xs">
                      <span className="block truncate max-w-[280px]">{p.rem_nome || "—"}</span>
                      <span className="block text-muted-foreground">→ {p.dest_nome || "—"}</span>
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">{p.toma_nome || fmtDoc(p.toma_cnpj)}</TableCell>
                    <TableCell className="text-xs">{p.coleta_xmun || "—"}/{p.coleta_uf || "—"} → {p.entrega_xmun || "—"}/{p.entrega_uf || "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => { setEditing({ ...p }); setPercTab("geral"); } }><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Excluir" onClick={() => { if (window.confirm(`Excluir o percurso "${p.nome}"?`)) excluir.mutate(p.id); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={v => { if (!v) setEditing(null); }}>
        <DialogContent>
          <div className="flex flex-col h-full gap-2">
            <DialogHeader>
              <DialogTitle className="text-sm">Editar percurso {editing?.codigo || ""} — {editing?.nome || ""}</DialogTitle>
            </DialogHeader>
            {editing && (
              <Tabs value={percTab} onValueChange={setPercTab} className="flex-1 flex flex-col min-h-0">
                <TabsList className="w-fit">
                  <TabsTrigger value="geral" className="text-xs">Geral</TabsTrigger>
                                    <TabsTrigger value="seguro" className="text-xs">Seguro e Pedágio</TabsTrigger>
                </TabsList>
                <TabsContent value="geral" className="mt-2 space-y-2">
                  <div className="grid grid-cols-[100px_1fr] gap-2">
                    <R label="Código" v={editing.codigo} />
                    <T editing={editing} set={set} label="Nome" k="nome" />
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <Parte titulo="Remetente" lgr={eRem.lgr} nro={eRem.nro} bai={eRem.bai} cep={eRem.cep} fone={eRem.fone} nome={editing.rem_nome} doc={editing.rem_cnpj} ie={eRem.ie} cid={eRem.cid} uf={eRem.uf} />
                    <Parte titulo="Destinatário" lgr={eDes.lgr} nro={eDes.nro} bai={eDes.bai} cep={eDes.cep} fone={eDes.fone} nome={editing.dest_nome} doc={editing.dest_cnpj} ie={eDes.ie} cid={eDes.cid} uf={eDes.uf} />
                    <Parte titulo="Tomador" lgr={eTom.lgr} nro={eTom.nro} bai={eTom.bai} cep={eTom.cep} fone={eTom.fone} nome={editing.toma_nome} doc={editing.toma_cnpj} ie={eTom.ie} cid={eTom.cid} uf={eTom.uf} />
                  </div>
                                    <div className="space-y-2">
                    <div className="border rounded px-2 py-1 space-y-1">
                      <p className="text-[11px] font-semibold">Consignatário</p>
                      <div className="grid grid-cols-12 gap-1">
                        <div className="col-span-2"><T editing={editing} set={set} label="CNPJ" k="consig_cnpj" mono on14={(d: string) => lookupParte("consig", d)} /></div>
                        <div className="col-span-4"><T editing={editing} set={set} label="Nome" k="consig_nome" /></div>
                        <div className="col-span-2"><T editing={editing} set={set} label="IE" k="consig_ie" /></div>
                        <div className="col-span-2"><T editing={editing} set={set} label="CEP" k="consig_cep" mono /></div>
                        <div className="col-span-2"><T editing={editing} set={set} label="UF" k="consig_uf" /></div>
                        <div className="col-span-4"><T editing={editing} set={set} label="Logradouro" k="consig_logradouro" /></div>
                        <div className="col-span-2"><T editing={editing} set={set} label="Número" k="consig_nro" /></div>
                        <div className="col-span-3"><T editing={editing} set={set} label="Bairro" k="consig_bairro" /></div>
                        <div className="col-span-3"><T editing={editing} set={set} label="Município" k="consig_xmun" /></div>
                      </div>
                    </div>
                    <div className="border rounded px-2 py-1 space-y-1">
                      <p className="text-[11px] font-semibold">Redespacho</p>
                      <div className="grid grid-cols-12 gap-1">
                        <div className="col-span-2"><T editing={editing} set={set} label="CNPJ" k="redesp_cnpj" mono on14={(d: string) => lookupParte("redesp", d)} /></div>
                        <div className="col-span-4"><T editing={editing} set={set} label="Nome" k="redesp_nome" /></div>
                        <div className="col-span-2"><T editing={editing} set={set} label="IE" k="redesp_ie" /></div>
                        <div className="col-span-2"><T editing={editing} set={set} label="CEP" k="redesp_cep" mono /></div>
                        <div className="col-span-2"><T editing={editing} set={set} label="UF" k="redesp_uf" /></div>
                        <div className="col-span-4"><T editing={editing} set={set} label="Logradouro" k="redesp_logradouro" /></div>
                        <div className="col-span-2"><T editing={editing} set={set} label="Número" k="redesp_nro" /></div>
                        <div className="col-span-3"><T editing={editing} set={set} label="Bairro" k="redesp_bairro" /></div>
                        <div className="col-span-3"><T editing={editing} set={set} label="Município" k="redesp_xmun" /></div>
                      </div>
                    </div>
                  </div>
                  
                                  <div className="border rounded p-2 space-y-1">
                    <p className="text-[11px] font-semibold">Coleta / Entrega / Emissão</p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-1">
                      <T editing={editing} set={set} label="Coleta município" k="coleta_xmun" />
                      <T editing={editing} set={set} label="Coleta UF" k="coleta_uf" />
                      <T editing={editing} set={set} label="Entrega município" k="entrega_xmun" />
                      <T editing={editing} set={set} label="Entrega UF" k="entrega_uf" />
                      <T editing={editing} set={set} label="CFOP" k="cfop" mono />
                      <T editing={editing} set={set} label="Distância km" k="distancia_km" />
                      <T editing={editing} set={set} label="Duração h" k="duracao_horas" />
                    </div>
                  </div>
                  <div className="border rounded p-2 space-y-1">
                    <p className="text-[11px] font-semibold">Fiscal</p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-1">
                      <T editing={editing} set={set} label="CST ICMS" k="icms_cst" />
                      <T editing={editing} set={set} label="Alíq. ICMS %" k="icms_aliq" />
                      <T editing={editing} set={set} label="Redução base %" k="reducao_base" />
                      <T editing={editing} set={set} label="Crédito outorgado" k="credito_outorgado" />
                      <T editing={editing} set={set} label="PIS %" k="pis_aliq" />
                      <T editing={editing} set={set} label="COFINS %" k="cofins_aliq" />
                      <T editing={editing} set={set} label="IR %" k="ir_aliq" />
                      <T editing={editing} set={set} label="INSS %" k="inss_aliq" />
                      <T editing={editing} set={set} label="CSLL %" k="csll_aliq" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Observação geral</Label>
                      <Textarea className="text-xs" rows={2} value={editing.obs_gerais ?? ""} onChange={e => set("obs_gerais", e.target.value)} />
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="seguro" className="mt-2 space-y-2">
                  <div className="border rounded p-2 space-y-1">
                    <p className="text-[11px] font-semibold">Seguro</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
                      <div className="col-span-2"><T editing={editing} set={set} label="Seguradora" k="seg_nome" /></div>
                      <T editing={editing} set={set} label="Apólice" k="seg_apolice" mono />
                      <T editing={editing} set={set} label="Averbação" k="seg_averbacao" mono />
                      <T editing={editing} set={set} label="RCTR-C" k="seg_rctr_c" />
                      <T editing={editing} set={set} label="RCF-DC" k="seg_rcf_dc" />
                      <T editing={editing} set={set} label="Adicional" k="seg_adicional" />
                      <T editing={editing} set={set} label="Total" k="seg_total" />
                      <T editing={editing} set={set} label="Responsável" k="seg_responsavel" />
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={!!editing.seg_repassar} onChange={e => set("seg_repassar", e.target.checked)} /> Repassar</label>
                      </div>
                    </div>
                  </div>
                  <div className="border rounded p-2 space-y-1">
                    <p className="text-[11px] font-semibold">Pedágio</p>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-1">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Pagamento</Label>
                        <Select value={editing.pedagio_pagto || "sem-pagamento"} onValueChange={v => set("pedagio_pagto", v)}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sem-pagamento">Sem Pagamento</SelectItem>
                            <SelectItem value="free-flow">Free Flow</SelectItem>
                            <SelectItem value="tag-transportador">TAG Transportador</SelectItem>
                            <SelectItem value="tag-tomador">TAG Tomador</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <T editing={editing} set={set} label="Operadora" k="pedagio_operadora" />
                      <T editing={editing} set={set} label="CNPJ operadora" k="pedagio_cnpj" mono />
                      <T editing={editing} set={set} label="Nº TAG" k="pedagio_tag" mono />
                      <T editing={editing} set={set} label="Vale (R$)" k="pedagio_vale" />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Fechar</Button>
              <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}><Save className="mr-1 h-3 w-3" /> Salvar</Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
