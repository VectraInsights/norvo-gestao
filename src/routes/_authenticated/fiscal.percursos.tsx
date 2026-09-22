import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/erp/money-input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Route as RoadIcon, Pencil, Trash2, Search, Save, ChevronDown, RefreshCw } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { useState, useMemo, useRef, useEffect } from "react";
import { toast } from "sonner";
import { limparIE, validarIE } from "@/lib/ie";
import { CFOPS_CTE } from "@/lib/cfops-transporte";

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

function T({ label, k, ph, mono, editing, set, on14, digits }: { label: string; k: string; ph?: string; mono?: boolean; editing: Percurso | null; set: (k: string, v: any) => void; on14?: (digits: string) => void; digits?: boolean }) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input className={"h-7 text-xs" + (mono ? " font-mono" : "")} value={editing?.[k] ?? ""} onChange={e => { const vv = digits ? e.target.value.replace(/\D/g, "") : e.target.value.toUpperCase(); set(k, vv); if (on14 && vv.replace(/\D/g, "").length === 14) on14(vv.replace(/\D/g, "")); }} placeholder={ph} />
    </div>
  );
}
function Tc({ label, k, mono, editing, set, ro }: { label: string; k: string; mono?: boolean; editing: Percurso | null; set: (k: string, v: any) => void; ro?: boolean }) {
  return (
    <div>
      <Label className="text-[9px] text-muted-foreground">{label}</Label>
      <Input className={"h-6 text-[11px]" + (mono ? " font-mono" : "") + (ro ? " bg-transparent dark:bg-transparent" : "")} value={editing?.[k] ?? ""} onChange={e => { set(k, e.target.value.toUpperCase()); }} placeholder="" readOnly={ro} />
    </div>
  );
}function Num({ editing, set, label, k, dec, prefix }: { editing: any; set: (k: string, v: any) => void; label: string; k: string; dec?: number; prefix?: string }) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <MoneyInput className="h-7 text-xs" prefix={prefix ?? ""} decimals={dec ?? 2} value={(editing as any)?.[k] ?? ""} onChange={v => set(k, v)} placeholder="0,00" />
    </div>
  );
}
function R({ label, v }: { label: string; v: any }) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input className="h-7 text-xs bg-transparent dark:bg-transparent" value={String(v ?? "")} readOnly />
    </div>
  );
}
function Parte({ titulo, nome, doc }: { titulo: string; nome: string; doc: string }) {
  return (
    <div className="grid grid-cols-12 gap-1 items-center">
      <p className="col-span-2 text-xs font-semibold truncate border rounded px-2 py-0.5 bg-transparent dark:bg-transparent">{titulo}</p>
      <p className="col-span-6 text-xs font-medium truncate border rounded px-2 py-0.5 bg-transparent dark:bg-transparent" title={nome}>{nome}</p>
      <p className="col-span-4 text-[11px] text-muted-foreground truncate border rounded px-2 py-0.5 bg-transparent dark:bg-transparent">CNPJ {fmtDoc(doc)}</p>
    </div>
  );
}
const CSTS_ICMS: Array<[string, string]> = [["00", "Tributada integralmente"], ["10", "Tributada e com cobran\u00e7a do ICMS por substitui\u00e7\u00e3o tribut\u00e1ria"], ["20", "Com redu\u00e7\u00e3o de base de c\u00e1lculo"], ["30", "Isenta ou n\u00e3o tributada e com cobran\u00e7a do ICMS por substitui\u00e7\u00e3o tribut\u00e1ria"], ["40", "Isenta"], ["41", "N\u00e3o tributada"], ["50", "Suspens\u00e3o"], ["51", "Diferimento"], ["60", "ICMS cobrado anteriormente por substitui\u00e7\u00e3o tribut\u00e1ria"], ["70", "Com redu\u00e7\u00e3o de base de c\u00e1lculo e cobran\u00e7a do ICMS por substitui\u00e7\u00e3o tribut\u00e1ria"], ["90", "Outras"]];
const normTxt = (s: any) => String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9 ]/g, " ").replace(/ +/g, " ").trim();
const OPTS_CST: { v: string; label: string }[] = CSTS_ICMS.map(([v, d]) => ({ v, label: v + " - " + d }));
const OPTS_CFOP: { v: string; label: string }[] = CFOPS_CTE.map(c => ({ v: String(c.codigo).replace(/\D/g, ""), label: c.descricao }));
function Combo({ label, value, onPick, opts }: { label: string; value: string; onPick: (v: string) => void; opts: { v: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState("");
  const sel = opts.find(o => o.v === value);
  const q = normTxt(txt);
  const list = (q ? opts.filter(o => normTxt(o.label).indexOf(q) >= 0 || normTxt(o.v).indexOf(q) >= 0) : opts).slice(0, 40);
  const snap = () => {
    const t = normTxt(txt);
    if (!t) return;
    const hit = opts.find(o => {
      const L = normTxt(o.label), V = normTxt(o.v);
      return L === t || V === t || (t.length >= 2 && (L.indexOf(t) === 0 || V.indexOf(t) === 0));
    });
    if (hit) onPick(hit.v);
  };
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input className="h-7 text-xs pr-6" value={open ? txt : (sel ? sel.label : (value || ""))} placeholder="Digite ou selecione"
          onFocus={() => { setTxt(""); setOpen(true); }}
          onChange={e => { setTxt(e.target.value); setOpen(true); }}
          onBlur={() => { setOpen(false); snap(); }}
          onKeyDown={e => { if (e.key === "Escape") { setOpen(false); } else if (e.key === "Enter" && list.length > 0) { e.preventDefault(); onPick(list[0].v); setOpen(false); (e.target as HTMLInputElement).blur(); } }} />
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        {open && list.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-44 overflow-auto rounded-md border bg-popover shadow-md">
            {list.map(o => (
              <div key={o.v} className="cursor-pointer px-2 py-1 text-[11px] hover:bg-accent" onMouseDown={e => { e.preventDefault(); onPick(o.v); setOpen(false); }}>{o.label}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
async function geoPorCep(cep: string): Promise<{ lat: number; lon: number } | null> {
  const d = String(cep || "").replace(/\D/g, "");
  if (d.length !== 8) return null;
  try {
    const r = await fetch("https://brasilapi.com.br/api/cep/v2/" + d);
    if (r.ok) {
      const j = await r.json();
      const c = j && j.location && j.location.coordinates;
      if (c && c.latitude && c.longitude) return { lat: Number(c.latitude), lon: Number(c.longitude) };
    }
  } catch { /* proxima fonte */ }
  try {
    const r = await fetch("https://cep.awesomeapi.com.br/json/" + d);
    if (r.ok) {
      const j = await r.json();
      if (j && j.lat && j.lng) return { lat: Number(j.lat), lon: Number(j.lng) };
    }
  } catch { /* proxima fonte */ }
  try {
    const q = new URLSearchParams({ postalcode: d, country: "Brasil", format: "json", limit: "1" });
    const r = await fetch("https://nominatim.openstreetmap.org/search?" + q.toString(), { headers: { Accept: "application/json" } });
    if (r.ok) {
      const j = await r.json();
      if (j && j[0] && j[0].lat && j[0].lon) return { lat: Number(j[0].lat), lon: Number(j[0].lon) };
    }
  } catch { return null; }
  return null;
}
async function geoPorCidade(xmun: string, uf: string): Promise<{ lat: number; lon: number } | null> {
  if (!xmun) return null;
  try {
    const q = new URLSearchParams({ city: xmun, state: uf || "", country: "Brasil", format: "json", limit: "1" });
    const r = await fetch("https://nominatim.openstreetmap.org/search?" + q.toString(), { headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    const j = await r.json();
    if (j && j[0] && j[0].lat && j[0].lon) return { lat: Number(j[0].lat), lon: Number(j[0].lon) };
  } catch { return null; }
  return null;
}
async function calcDistDur(o: { cep: string; xmun: string; uf: string }, d: { cep: string; xmun: string; uf: string }): Promise<{ km: string; h: string }> {
  const dOrig = String(o.cep || "").replace(/\D/g, "");
  const dDst = String(d.cep || "").replace(/\D/g, "");
  const go = (await geoPorCep(dOrig)) || (await geoPorCidade(o.xmun, o.uf));
  if (!go) throw new Error("Origem nao localizada (CEP " + (dOrig || "?") + " / " + (o.xmun || "?") + "-" + (o.uf || "?") + ") — confira o cadastro");
  const gd = (await geoPorCep(dDst)) || (await geoPorCidade(d.xmun, d.uf));
  if (!gd) throw new Error("Destino nao localizado (CEP " + (dDst || "?") + " / " + (d.xmun || "?") + "-" + (d.uf || "?") + ") — confira o cadastro");
  let j: any = null;
  try {
    const r = await fetch("https://router.project-osrm.org/route/v1/driving/" + go.lon + "," + go.lat + ";" + gd.lon + "," + gd.lat + "?overview=false&alternatives=true");
    if (!r.ok) throw new Error("x");
    j = await r.json();
  } catch { throw new Error("Falha no calculo da rota (OSRM)"); }
  const routes = (j && j.routes) || [];
  if (!routes.length) throw new Error("Rota nao encontrada entre os CEPs");
  const m = Math.min(...routes.map((x: any) => Number(x.distance) || Infinity));
  if (!isFinite(m)) throw new Error("Rota nao encontrada entre os CEPs");
  const km = Math.round(m / 1000);
  const volante = km / 60;
  const dias = Math.max(1, Math.ceil(volante / 12));
  const total = Math.floor(volante + (dias > 1 ? 12 * dias : 0) + 0.4);
  return { km: String(km), h: String(total) };
}
function PercursosPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const voltarCteRef = useRef(false);
  const [busca, setBusca] = useState("");
  const [percTab, setPercTab] = useState("geral");
  const [editing, setEditing] = useState<Percurso | null>(null);
  const [calcando, setCalcando] = useState(false);
  const rotaRef = useRef<{ id: string | null; sig: string }>({ id: null, sig: "" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Chegada via CT-e (Gerar sem percurso): abre rascunho pré-preenchido e volta ao salvar
  useEffect(() => {
    if (!empresa || !percursos) return;
    let pre: any = null;
    try { pre = JSON.parse(localStorage.getItem("prefill_percurso_from_cte") || "null"); } catch { pre = null; }
    if (!pre?.remCnpj || !pre?.destCnpj || !pre?.tomaCnpj) return;
    try { localStorage.removeItem("prefill_percurso_from_cte"); } catch {}
    const dg = (v: any) => String(v || "").replace(/\D/g, "");
    const existe = percursos.some(p => dg(p.rem_cnpj) === dg(pre.remCnpj) && dg(p.dest_cnpj) === dg(pre.destCnpj) && dg(p.toma_cnpj) === dg(pre.tomaCnpj));
    voltarCteRef.current = pre.returnTo === "/fiscal/cte";
    if (existe) {
      toast.success("Percurso já cadastrado — de volta ao CT-e");
      if (voltarCteRef.current) { voltarCteRef.current = false; navigate({ to: "/fiscal/cte" } as any); }
      return;
    }
    setEditing({ id: "", codigo: "NOVO", nome: ((pre.remNome || "Origem") + " > " + (pre.destNome || "Destino")).slice(0, 80), rem_cnpj: dg(pre.remCnpj), rem_nome: pre.remNome || "", dest_cnpj: dg(pre.destCnpj), dest_nome: pre.destNome || "", toma_cnpj: dg(pre.tomaCnpj), toma_nome: pre.tomaNome || "" } as Percurso);
    setPercTab("geral");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa?.id, (percursos || []).length]);

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
  const montarRota = (ed: Percurso) => {
    const digits = (s: any) => String(s || "").replace(/\D/g, "");
    const upper = (s: any) => String(s || "").trim().toUpperCase();
    const temRedesp = digits(ed.redesp_cnpj).length === 14;
    const fbRem = contatoByDoc.get(digits(ed.rem_cnpj)) || {};
    const fbDst = contatoByDoc.get(digits(temRedesp ? ed.redesp_cnpj : ed.dest_cnpj)) || {};
    const ori = { cep: String(ed.rem_cep || fbRem.cep || ""), xmun: String(ed.coleta_xmun || ed.rem_xmun || fbRem.cidade || ""), uf: String(ed.coleta_uf || ed.rem_uf || fbRem.uf || "") };
    const dst = temRedesp
      ? { cep: String(ed.redesp_cep || ""), xmun: String(ed.entrega_xmun || ed.redesp_xmun || ""), uf: String(ed.entrega_uf || ed.redesp_uf || "") }
      : { cep: String(ed.dest_cep || fbDst.cep || ""), xmun: String(ed.entrega_xmun || ed.dest_xmun || fbDst.cidade || ""), uf: String(ed.entrega_uf || ed.dest_uf || fbDst.uf || "") };
    const sig = [digits(ori.cep), upper(ori.xmun), upper(ori.uf)].join("/") + ">" + [digits(dst.cep), upper(dst.xmun), upper(dst.uf)].join("/");
    return { ori, dst, sig };
  };
  const recalcular = async () => {
    if (!editing) return;
    const { ori, dst } = montarRota(editing);
    setCalcando(true);
    try {
      const calc = await calcDistDur(ori, dst);
      setEditing(e => (e ? { ...e, distancia_km: calc.km, duracao_horas: calc.h } : e));
      toast.success("Distancia recalculada: " + calc.km + " km / " + calc.h + " h");
    } catch (e: any) { toast.error(e && e.message ? e.message : "Falha no recalculo"); }
    finally { setCalcando(false); }
  };
  useEffect(() => {
    if (!editing) { rotaRef.current = { id: null, sig: "" }; return; }
    const { ori, dst, sig } = montarRota(editing);
    if (rotaRef.current.id !== editing.id) { rotaRef.current = { id: editing.id, sig }; return; }
    if (sig === rotaRef.current.sig) return;
    rotaRef.current.sig = sig;
    if (!String(dst.cep).replace(/\D/g, "") && !String(dst.xmun).trim()) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setCalcando(true);
      try {
        const calc = await calcDistDur(ori, dst);
        setEditing(e => (e && e.id === editing.id ? { ...e, distancia_km: calc.km, duracao_horas: calc.h } : e));
        toast.success("Distancia recalculada: " + calc.km + " km / " + calc.h + " h");
      } catch (e: any) { toast.error(e && e.message ? e.message : "Falha no recalculo"); }
      finally { setCalcando(false); }
    }, 900);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [editing ? editing.id : null, editing ? editing.rem_cnpj : "", editing ? editing.rem_cep : "", editing ? editing.rem_xmun : "", editing ? editing.rem_uf : "", editing ? editing.coleta_xmun : "", editing ? editing.coleta_uf : "", editing ? editing.dest_cnpj : "", editing ? editing.dest_cep : "", editing ? editing.dest_xmun : "", editing ? editing.dest_uf : "", editing ? editing.entrega_xmun : "", editing ? editing.entrega_uf : "", editing ? editing.redesp_cnpj : "", editing ? editing.redesp_cep : "", editing ? editing.redesp_xmun : "", editing ? editing.redesp_uf : ""]);
  const salvar = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Nada para salvar");
      const pend: string[] = [];
      for (const p of [{ k: "consig", label: "Consignatario" }, { k: "redesp", label: "Redespacho" }]) {
        const doc = String((editing as any)[p.k + "_cnpj"] || "").replace(/\D/g, "");
        const ie = limparIE((editing as any)[p.k + "_ie"]);
        const uf = String((editing as any)[p.k + "_uf"] || "").toUpperCase();
        if (doc.length > 0 && !ie) pend.push("Inscricao Estadual de " + p.label + " (ou ISENTO)");
        else if (doc.length > 0 && ie) { const v = validarIE(uf, ie); if (!v.ok) pend.push("IE de " + p.label + " fora do padrao de " + (uf || "?") + " (espera " + v.esperados.join(" ou ") + " digitos, tem " + v.digitos + ")"); }
      }
      if (pend.length > 0) throw new Error("Pendencias: " + pend.join("; "));
      const payload: Record<string, any> = {};
      for (const k of EDITAVEIS) { const v = (editing as any)[k]; const vv = k.endsWith("_ie") ? limparIE(v) : v; payload[k] = typeof vv === "string" ? vv.toUpperCase() : (vv ?? (k === "seg_repassar" ? false : "")); }
      for (const p of ["rem", "dest", "toma"]) {
        const c = contatoByDoc.get(String(editing[p + "_cnpj"] || "").replace(/\D/g, "")) || {};
        const fb: Record<string, any> = { ie: c.ie, logradouro: c.logradouro, nro: c.numero, bairro: c.bairro, xmun: c.cidade, uf: c.uf, cep: c.cep, fone: c.telefone };
        for (const k of Object.keys(fb)) { const col = p + "_" + k; if (!payload[col] && fb[k]) payload[col] = fb[k]; }
      }
      if (!empresa) throw new Error("Empresa nao selecionada");
      const digits = (s: any) => String(s || "").replace(/\D/g, "");
      const upper = (s: any) => String(s || "").trim().toUpperCase();
      const temRedesp = digits(payload.redesp_cnpj).length === 14;
      const sig = (cep: any, xmun: any, uf: any) => [digits(cep), upper(xmun), upper(uf)].join("/");
      const oriOrg = { cep: String(payload.rem_cep || ""), xmun: String(payload.coleta_xmun || payload.rem_xmun || ""), uf: String(payload.coleta_uf || payload.rem_uf || "") };
      const dstOrg = temRedesp
        ? { cep: String(payload.redesp_cep || ""), xmun: String(payload.entrega_xmun || payload.redesp_xmun || ""), uf: String(payload.entrega_uf || payload.redesp_uf || "") }
        : { cep: String(payload.dest_cep || ""), xmun: String(payload.entrega_xmun || payload.dest_xmun || ""), uf: String(payload.entrega_uf || payload.dest_uf || "") };
      const rotaAtual = sig(oriOrg.cep, oriOrg.xmun, oriOrg.uf) + ">" + sig(dstOrg.cep, dstOrg.xmun, dstOrg.uf);
      const { data: salvo } = await supabase.from("cte_percursos" as any).select("rem_cep,rem_xmun,coleta_xmun,coleta_uf,rem_uf,dest_cep,dest_xmun,dest_uf,redesp_cnpj,redesp_cep,redesp_xmun,redesp_uf").eq("id", editing.id).maybeSingle();
      const sv: any = salvo || {};
      const temRedespSv = digits(sv.redesp_cnpj).length === 14;
      const rotaSalva = sig(sv.rem_cep, sv.coleta_xmun || sv.rem_xmun, sv.coleta_uf || sv.rem_uf) + ">" + (temRedespSv ? sig(sv.redesp_cep, sv.entrega_xmun || sv.redesp_xmun, sv.entrega_uf || sv.redesp_uf) : sig(sv.dest_cep, sv.entrega_xmun || sv.dest_xmun, sv.entrega_uf || sv.dest_uf));
      const mudouRota = rotaAtual !== rotaSalva;
      if (!payload.distancia_km || !payload.duracao_horas || mudouRota) {
        const calc = await calcDistDur(oriOrg, dstOrg);
        if (mudouRota) { payload.distancia_km = calc.km; payload.duracao_horas = calc.h; toast.success("Distancia recalculada: " + calc.km + " km / " + calc.h + " h"); }
        else {
          if (!payload.distancia_km) payload.distancia_km = calc.km;
          if (!payload.duracao_horas) payload.duracao_horas = calc.h;
        }
        setEditing(e => (e ? { ...e, distancia_km: payload.distancia_km, duracao_horas: payload.duracao_horas } : e));
      }
      if (!editing.id) {        const remD = digits(payload.rem_cnpj || (editing as any).rem_cnpj);
        const dstD = digits(payload.dest_cnpj || (editing as any).dest_cnpj);
        const tomD = digits(payload.toma_cnpj || (editing as any).toma_cnpj);
        if (remD.length !== 14 || dstD.length !== 14 || tomD.length !== 14) throw new Error("Remetente, destinatário e tomador precisam de CNPJ válido");
        const { data: mx } = await supabase.from("cte_percursos" as any).select("codigo").eq("empresa_id", empresa.id).order("codigo", { ascending: false }).limit(1);
        const last = parseInt((((mx as any[])?.[0] as any)?.codigo || "0"), 10) || 0;
        const codigo = String(last + 1).padStart(4, "0");
        const nome = String((editing as any).nome || (((editing as any).rem_nome || "Origem") + " > " + ((editing as any).dest_nome || "Destino"))).slice(0, 80).toUpperCase();
        const { data: ins, error: insErr } = await supabase.from("cte_percursos" as any).insert({ empresa_id: empresa.id, codigo, nome, rem_cnpj: remD, rem_nome: (editing as any).rem_nome || "", dest_cnpj: dstD, dest_nome: (editing as any).dest_nome || "", toma_cnpj: tomD, toma_nome: (editing as any).toma_nome || "", ...payload }).select("id").maybeSingle();
        if (insErr) throw insErr;
      } else {
        const { error: updErr } = await supabase.from("cte_percursos" as any).update(payload).eq("id", editing.id);
        if (updErr) throw updErr;
      }
      const wbs = (["consig", "redesp"] as const).map(async p => {
        const doc = String(payload[p + "_cnpj"] || "").replace(/\D/g, "");
        if (doc.length !== 14) return;
        const crow: Record<string, any> = { nome: payload[p + "_nome"] || null, ie: payload[p + "_ie"] || null, uf: payload[p + "_uf"] || null, cidade: payload[p + "_xmun"] || null, logradouro: payload[p + "_logradouro"] || null, numero: payload[p + "_nro"] || null, bairro: payload[p + "_bairro"] || null, cep: payload[p + "_cep"] || null };
        const { data: ex } = await supabase.from("contatos" as any).select("id").eq("empresa_id", empresa.id).eq("documento", doc).maybeSingle();
        if (ex) { await supabase.from("contatos" as any).update(crow).eq("id", (ex as any).id); }
        else { await supabase.from("contatos" as any).insert({ empresa_id: empresa.id, tipo: "cliente", documento: doc, ...crow } as any); }
      });
      await Promise.all([...wbs]);
      qc.invalidateQueries({ queryKey: ["contatos-cte", empresa.id] });
    },
    onSuccess: () => {
      toast.success("Percurso salvo");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["cte-percursos", empresa?.id] });
      if (voltarCteRef.current) { voltarCteRef.current = false; navigate({ to: "/fiscal/cte" } as any); }
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
  // Apagou o CNPJ: limpa os demais dados da parte junto
  useEffect(() => {
    if (!editing) return;
    const patch: Record<string, any> = {};
    let changed = false;
    for (const p of ["consig", "redesp"]) {
      if (!(editing[p + "_cnpj"] || "").replace(/\D/g, "")) {
        let has = false;
        for (const k of ["nome", "ie", "uf", "xmun", "cep", "logradouro", "nro", "bairro"]) { if ((editing as any)[p + "_" + k]) { (patch as any)[p + "_" + k] = ""; has = true; } }
        if (has) { changed = true; lastLookupParte.current[p] = ""; }
      }
    }
    if (changed) setEditing(e => (e ? { ...e, ...patch } : e));
  }, [editing?.consig_cnpj, editing?.redesp_cnpj]);
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
                    <TableCell><Badge className="bg-primary/15 text-primary font-mono">{p.codigo || "—"}</Badge></TableCell>
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
        <DialogContent className="p-3 sm:p-4">
          <div className="flex flex-col h-full gap-2">
            <DialogHeader>
              <DialogTitle className="text-sm">{editing?.id ? <>Editar percurso {editing?.codigo || ""} — {editing?.nome || ""}</> : <>Novo percurso</>}</DialogTitle>
            </DialogHeader>
            {editing && (
              <Tabs value={percTab} onValueChange={setPercTab} className="flex-1 flex flex-col min-h-0">
                <TabsList className="w-fit h-8">
                  <TabsTrigger value="geral" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Geral</TabsTrigger>
                                    <TabsTrigger value="seguro" className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Seguro e Pedágio</TabsTrigger>
                </TabsList>
                <TabsContent value="geral" className="mt-2 space-y-1 flex-1 flex flex-col min-h-0">
                                                      
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="md:col-span-3 flex flex-col justify-between gap-2">
                      <Parte titulo="Remetente" nome={editing.rem_nome} doc={editing.rem_cnpj} />
                      <Parte titulo="Destinatário" nome={editing.dest_nome} doc={editing.dest_cnpj} />
                      <Parte titulo="Tomador" nome={editing.toma_nome} doc={editing.toma_cnpj} />
                    </div>
                    <div className="border rounded px-2 py-1 h-full flex flex-col">
<div className="flex items-center justify-between"><p className="text-[11px] font-semibold">Coleta / Entrega</p><Button size="icon" variant="ghost" className="h-5 w-5" title="Recalcular distancia e duracao" onClick={recalcular} disabled={calcando}><RefreshCw className={"h-3 w-3" + (calcando ? " animate-spin" : "")} /></Button></div>
                      <div className="flex-1 flex flex-col gap-1 py-0.5">
<div className="flex items-center gap-1"><span className="text-[9px] text-muted-foreground w-12 shrink-0">Coleta</span><Input className="h-6 text-[11px] flex-1 min-w-0 bg-transparent dark:bg-transparent" readOnly value={editing.coleta_xmun || ""} onChange={e => set("coleta_xmun", e.target.value)} /><span className="text-[9px] text-muted-foreground shrink-0">UF</span><Input className="h-6 text-[11px] w-12 text-center shrink-0 bg-transparent dark:bg-transparent" readOnly value={editing.coleta_uf || ""} onChange={e => set("coleta_uf", e.target.value.toUpperCase())} maxLength={2} /></div>
<div className="flex items-center gap-1"><span className="text-[9px] text-muted-foreground w-12 shrink-0">Entrega</span><Input className="h-6 text-[11px] flex-1 min-w-0 bg-transparent dark:bg-transparent" readOnly value={editing.entrega_xmun || ""} onChange={e => set("entrega_xmun", e.target.value)} /><span className="text-[9px] text-muted-foreground shrink-0">UF</span><Input className="h-6 text-[11px] w-12 text-center shrink-0 bg-transparent dark:bg-transparent" readOnly value={editing.entrega_uf || ""} onChange={e => set("entrega_uf", e.target.value.toUpperCase())} maxLength={2} /></div>
<div className="flex items-center gap-1"><span className="text-[9px] text-muted-foreground shrink-0">Distância</span><Input className="h-6 text-[11px] w-0 flex-1 min-w-0" value={editing.distancia_km || ""} onChange={e => set("distancia_km", e.target.value)} /><span className="text-[9px] text-muted-foreground shrink-0">km</span><span className="text-[9px] text-muted-foreground shrink-0">Duração</span><Input className="h-6 text-[11px] w-0 flex-1 min-w-0" value={editing.duracao_horas || ""} onChange={e => set("duracao_horas", e.target.value)} /><span className="text-[9px] text-muted-foreground shrink-0">h</span></div>
</div>
                    </div>
                  </div>
                  
                  
                  
                                    <div className="space-y-2">
                    <div className="border rounded px-2 py-1 space-y-1">
                      <p className="text-[11px] font-semibold">Consignatário</p>
<div className="grid grid-cols-12 gap-1">
                        <div className="col-span-2"><T editing={editing} set={set} label="CNPJ" k="consig_cnpj" mono on14={(d: string) => lookupParte("consig", d)} /></div>
                        <div className="col-span-3"><T editing={editing} set={set} label="Nome" k="consig_nome" /></div>
                        <div className="col-span-2"><T editing={editing} set={set} label="IE" k="consig_ie" digits /></div>
                        <div className="col-span-2"><T editing={editing} set={set} label="CEP" k="consig_cep" mono /></div>
                        <div className="col-span-2"><T editing={editing} set={set} label="Município" k="consig_xmun" /></div>
                        <div className="col-span-1"><T editing={editing} set={set} label="UF" k="consig_uf" /></div>
                      </div>
                    </div>
                    <div className="border rounded px-2 py-1 space-y-1">
                      <p className="text-[11px] font-semibold">Redespacho</p>
<div className="grid grid-cols-12 gap-1">
                        <div className="col-span-2"><T editing={editing} set={set} label="CNPJ" k="redesp_cnpj" mono on14={(d: string) => lookupParte("redesp", d)} /></div>
                        <div className="col-span-3"><T editing={editing} set={set} label="Nome" k="redesp_nome" /></div>
                        <div className="col-span-2"><T editing={editing} set={set} label="IE" k="redesp_ie" digits /></div>
                        <div className="col-span-2"><T editing={editing} set={set} label="CEP" k="redesp_cep" mono /></div>
                        <div className="col-span-2"><T editing={editing} set={set} label="Município" k="redesp_xmun" /></div>
                        <div className="col-span-1"><T editing={editing} set={set} label="UF" k="redesp_uf" /></div>
                      </div>
                    </div>
                  </div>
                  <div className="border rounded p-2 space-y-1 flex flex-col flex-1"><p className="text-[11px] font-semibold">Fiscal</p>
                    <div className="space-y-1"><div className="flex flex-col gap-1 md:flex-row"><div className="md:w-[45%]"><Combo label="CST ICMS" value={editing.icms_cst || "00"} onPick={v => set("icms_cst", v)} opts={OPTS_CST} /></div><div className="md:flex-1">
                      <Combo label="CFOP" value={editing.cfop || ""} onPick={v => set("cfop", v)} opts={OPTS_CFOP} /></div></div><div className="grid grid-cols-2 md:grid-cols-8 gap-1">
                      <Num editing={editing} set={set} label="Alíq. ICMS %" k="icms_aliq" />
                      <Num editing={editing} set={set} label="Redução base %" k="reducao_base" />
                      <Num editing={editing} set={set} label="Crédito outorgado" k="credito_outorgado" />
                      <Num editing={editing} set={set} label="PIS %" k="pis_aliq" />
                      <Num editing={editing} set={set} label="COFINS %" k="cofins_aliq" />
                      <Num editing={editing} set={set} label="IR %" k="ir_aliq" />
                      <Num editing={editing} set={set} label="INSS %" k="inss_aliq" />
                      <Num editing={editing} set={set} label="CSLL %" k="csll_aliq" />
                    </div></div>
                    <div className="flex-1 flex flex-col min-h-0"><Label className="text-[10px] text-muted-foreground">Observação geral</Label>
                      <Textarea className="text-xs flex-1 resize-none" rows={1} value={editing.obs_gerais ?? ""} onChange={e => set("obs_gerais", e.target.value.toUpperCase())} />
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
                      <Num editing={editing} set={set} label="RCTR-C" k="seg_rctr_c" prefix="R$" />
                      <Num editing={editing} set={set} label="RCF-DC" k="seg_rcf_dc" prefix="R$" />
                      <Num editing={editing} set={set} label="Adicional" k="seg_adicional" prefix="R$" />
                      <Num editing={editing} set={set} label="Total" k="seg_total" prefix="R$" />
                      <T editing={editing} set={set} label="Responsável" k="seg_responsavel" />
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={!!editing.seg_repassar} onChange={e => set("seg_repassar", e.target.checked)} /> Repassar</label>
                      </div>
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
