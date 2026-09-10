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
import { useState } from "react";
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

function T({ label, k, ph, mono, editing, set }: { label: string; k: string; ph?: string; mono?: boolean; editing: Percurso | null; set: (k: string, v: any) => void }) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input className={"h-7 text-xs" + (mono ? " font-mono" : "")} value={editing?.[k] ?? ""} onChange={e => set(k, e.target.value)} placeholder={ph} />
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
function Parte({ titulo, nome, doc, ie, cid, uf }: { titulo: string; nome: string; doc: string; ie: string; cid: string; uf: string }) {
  return (
    <div className="border rounded p-2 bg-muted/20 space-y-1">
      <p className="text-[11px] font-semibold">{titulo}</p>
      <R label="Nome" v={nome} />
      <div className="grid grid-cols-2 gap-1">
        <R label="CNPJ" v={fmtDoc(doc)} />
        <R label="IE" v={ie || "ISENTO"} />
      </div>
      <div className="grid grid-cols-3 gap-1">
        <div className="col-span-2"><R label="Municipio" v={cid} /></div>
        <R label="UF" v={uf} />
      </div>
      <p className="text-[9px] text-muted-foreground">Chave do percurso (nao editavel).</p>
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

  const salvar = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Nada para salvar");
      const payload: Record<string, any> = {};
      for (const k of EDITAVEIS) payload[k] = editing[k] ?? (k === "seg_repassar" ? false : "");
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
                  <TabsTrigger value="rota" className="text-xs">Rota e Fiscal</TabsTrigger>
                  <TabsTrigger value="seguro" className="text-xs">Seguro e Pedágio</TabsTrigger>
                </TabsList>
                <TabsContent value="geral" className="mt-2 space-y-2">
                  <div className="grid grid-cols-[100px_1fr] gap-2">
                    <R label="Código" v={editing.codigo} />
                    <T editing={editing} set={set} label="Nome" k="nome" />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <Parte titulo="Remetente" nome={editing.rem_nome} doc={editing.rem_cnpj} ie={editing.rem_ie} cid={editing.rem_xmun} uf={editing.rem_uf} />
                    <Parte titulo="Destinatário" nome={editing.dest_nome} doc={editing.dest_cnpj} ie={editing.dest_ie} cid={editing.dest_xmun} uf={editing.dest_uf} />
                    <Parte titulo="Tomador" nome={editing.toma_nome} doc={editing.toma_cnpj} ie={editing.toma_ie} cid={editing.toma_xmun} uf={editing.toma_uf} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="border rounded p-2 space-y-1">
                      <p className="text-[11px] font-semibold">Consignatário</p>
                      <div className="grid grid-cols-2 gap-1">
                        <T editing={editing} set={set} label="CNPJ" k="consig_cnpj" mono />
                        <T editing={editing} set={set} label="Nome" k="consig_nome" />
                        <T editing={editing} set={set} label="IE" k="consig_ie" />
                        <T editing={editing} set={set} label="CEP" k="consig_cep" mono />
                        <T editing={editing} set={set} label="Município" k="consig_xmun" />
                        <T editing={editing} set={set} label="UF" k="consig_uf" />
                        <div className="col-span-2"><T editing={editing} set={set} label="Logradouro" k="consig_logradouro" /></div>
                        <T editing={editing} set={set} label="Número" k="consig_nro" />
                        <T editing={editing} set={set} label="Bairro" k="consig_bairro" />
                      </div>
                    </div>
                    <div className="border rounded p-2 space-y-1">
                      <p className="text-[11px] font-semibold">Redespacho</p>
                      <div className="grid grid-cols-2 gap-1">
                        <T editing={editing} set={set} label="CNPJ" k="redesp_cnpj" mono />
                        <T editing={editing} set={set} label="Nome" k="redesp_nome" />
                        <T editing={editing} set={set} label="IE" k="redesp_ie" />
                        <T editing={editing} set={set} label="CEP" k="redesp_cep" mono />
                        <T editing={editing} set={set} label="Município" k="redesp_xmun" />
                        <T editing={editing} set={set} label="UF" k="redesp_uf" />
                        <div className="col-span-2"><T editing={editing} set={set} label="Logradouro" k="redesp_logradouro" /></div>
                        <T editing={editing} set={set} label="Número" k="redesp_nro" />
                        <T editing={editing} set={set} label="Bairro" k="redesp_bairro" />
                      </div>
                    </div>
                  </div>
                </TabsContent>
                <TabsContent value="rota" className="mt-2 space-y-2">
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
