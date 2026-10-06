import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/erp/money-input";
import { Combobox } from "@/components/erp/combobox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Route as RoadIcon,
  Pencil,
  Trash2,
  Search,
  Save,
  ChevronDown,
  RefreshCw,
  Plus,
  Loader2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { useState, useMemo, useRef, useEffect } from "react";
import { toast } from "sonner";
import { limparIE, validarIE } from "@/lib/ie";
import { maskDoc } from "@/lib/format";
import { TIPOS_CARGA_ANTT } from "@/lib/piso-antt";
import { CFOPS_CTE } from "@/lib/cfops-transporte";

export const Route = createFileRoute("/_authenticated/fiscal/percursos")({
  component: PercursosPage,
  head: () => ({ meta: [{ title: "Percursos — Norvo" }] }),
});

type Percurso = Record<string, any> & { id: string };

// Normaliza nome de cidade p/ comparar (minúsculas, sem acento)
const normCidade = (s: any) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

type Mun = { nome: string; uf: string; id: number };
// Cache compartilhado com o cadastro de colaboradores
async function carregarMunicipios(): Promise<Mun[]> {
  try {
    const raw = localStorage.getItem("ibge-municipios-v1");
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 5000 && arr.some((m: any) => m.id))
        return arr.map((m: any) => ({ nome: String(m.nome ?? ""), uf: String(m.uf ?? ""), id: Number(m.id ?? 0) }));
    }
  } catch {}
  const r = await fetch(
    "https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome",
  );
  const j = await r.json();
  const arr = (j as any[]).map((m) => ({
    nome: String(m.nome ?? ""),
    uf: String(m.microrregiao?.mesorregiao?.UF?.sigla ?? ""),
    id: Number(m.id ?? 0),
  }));
  try {
    localStorage.setItem("ibge-municipios-v1", JSON.stringify(arr));
  } catch {}
  return arr;
}

// Colunas editáveis. Remetente/destinatário/tomador formam a chave e NUNCA entram aqui.
const EDITAVEIS = [
  "nome",
  "coleta_cmun",
  "coleta_xmun",
  "coleta_uf",
  "entrega_cmun",
  "entrega_xmun",
  "entrega_uf",
  "cfop",
  "nat_operacao",
  "tipo_carga_antt",
  "consig_cnpj",
  "consig_nome",
  "consig_ie",
  "consig_uf",
  "consig_xmun",
  "consig_cep",
  "consig_logradouro",
  "consig_nro",
  "consig_bairro",
  "redesp_cnpj",
  "redesp_nome",
  "redesp_ie",
  "redesp_uf",
  "redesp_xmun",
  "redesp_cep",
  "redesp_logradouro",
  "redesp_nro",
  "redesp_bairro",
  "seg_nome",
  "seg_cnpj",
  "seg_apolice",
  "seg_averbacao",
  "seg_rctr_c",
  "seg_rcf_dc",
  "seg_adicional",
  "seg_total",
  "seg_repassar",
  "seg_responsavel",
  "distancia_km",
  "duracao_horas",
  "icms_cst",
  "icms_aliq",
  "reducao_base",
  "credito_outorgado",
  "pis_aliq",
  "cofins_aliq",
  "ir_aliq",
  "inss_aliq",
  "csll_aliq",
  "obs_gerais",
];

const fmtDoc = (d: any) => {
  const s = String(d || "").replace(/\D/g, "");
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return s || "—";
};

function T({
  label,
  k,
  ph,
  mono,
  editing,
  set,
  on14,
  digits,
  doc,
}: {
  label: string;
  k: string;
  ph?: string;
  mono?: boolean;
  editing: Percurso | null;
  set: (k: string, v: any) => void;
  on14?: (digits: string) => void;
  digits?: boolean;
  doc?: boolean;
}) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        className={"h-7 text-xs" + (mono ? " font-mono" : "")}
        value={editing?.[k] ?? ""}
        onChange={(e) => {
          const vv = doc
            ? maskDoc(e.target.value)
            : digits
              ? e.target.value.replace(/\D/g, "")
              : e.target.value.toUpperCase();
          set(k, vv);
          if (on14 && vv.replace(/\D/g, "").length === 14) on14(vv.replace(/\D/g, ""));
        }}
        placeholder={ph}
      />
    </div>
  );
}
function Tc({
  label,
  k,
  mono,
  editing,
  set,
  ro,
}: {
  label: string;
  k: string;
  mono?: boolean;
  editing: Percurso | null;
  set: (k: string, v: any) => void;
  ro?: boolean;
}) {
  return (
    <div>
      <Label className="text-[9px] text-muted-foreground">{label}</Label>
      <Input
        className={
          "h-6 text-[11px]" +
          (mono ? " font-mono" : "") +
          (ro ? " bg-transparent dark:bg-transparent" : "")
        }
        value={editing?.[k] ?? ""}
        onChange={(e) => {
          set(k, e.target.value.toUpperCase());
        }}
        placeholder=""
        readOnly={ro}
      />
    </div>
  );
}
function Num({
  editing,
  set,
  label,
  k,
  dec,
  prefix,
  fixo,
}: {
  editing?: any;
  set?: (k: string, v: any) => void;
  label: string;
  k?: string;
  dec?: number;
  prefix?: string;
  fixo?: string;
}) {
  if (fixo !== undefined)
    return (
      <div>
        <Label className="text-[10px] text-muted-foreground">{label}</Label>
        <Input className="h-7 text-xs bg-muted" value={fixo} readOnly />
      </div>
    );
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <MoneyInput
        className="h-7 text-xs"
        prefix={prefix ?? ""}
        decimals={dec ?? 2}
        value={(editing as any)?.[k!] ?? ""}
        onChange={(v) => set!(k!, v)}
        placeholder="0,00"
      />
    </div>
  );
}
function R({ label, v }: { label: string; v: any }) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        className="h-7 text-xs bg-transparent dark:bg-transparent"
        value={String(v ?? "")}
        readOnly
      />
    </div>
  );
}
function Parte({ titulo, nome, doc }: { titulo: string; nome: string; doc: string }) {
  return (
    <div className="grid grid-cols-12 gap-1 items-center">
      <p className="col-span-2 text-xs font-semibold truncate border rounded px-2 py-0.5 bg-transparent dark:bg-transparent">
        {titulo}
      </p>
      <p
        className="col-span-6 text-xs font-medium truncate border rounded px-2 py-0.5 bg-transparent dark:bg-transparent"
        title={nome}
      >
        {nome}
      </p>
      <p className="col-span-4 text-[11px] text-muted-foreground truncate border rounded px-2 py-0.5 bg-transparent dark:bg-transparent">
        CNPJ {fmtDoc(doc)}
      </p>
    </div>
  );
}
// Remetente/Destinatário/Tomador editáveis (só em percurso novo/avulso)
function ChaveEdit({
  titulo,
  nome,
  doc,
  onNome,
  onDoc,
  onBlurDoc,
}: {
  titulo: string;
  nome: string;
  doc: string;
  onNome: (v: string) => void;
  onDoc: (v: string) => void;
  onBlurDoc: () => void;
}) {
  return (
    <div className="grid grid-cols-12 gap-1 items-center">
      <p className="col-span-2 text-xs font-semibold truncate border rounded px-2 py-0.5 bg-transparent dark:bg-transparent">
        {titulo}
      </p>
      <Input
        className="col-span-6 h-6 text-[11px]"
        value={nome || ""}
        onChange={(e) => onNome(e.target.value.toUpperCase())}
        placeholder="Nome"
      />
      <Input
        className="col-span-4 h-6 text-[11px]"
        value={doc || ""}
        onChange={(e) => onDoc(maskDoc(e.target.value))}
        onBlur={onBlurDoc}
        placeholder="CNPJ"
        inputMode="numeric"
      />
    </div>
  );
}
const CSTS_ICMS: Array<[string, string]> = [
  ["00", "Tributada integralmente"],
  ["10", "Tributada e com cobran\u00e7a do ICMS por substitui\u00e7\u00e3o tribut\u00e1ria"],
  ["20", "Com redu\u00e7\u00e3o de base de c\u00e1lculo"],
  [
    "30",
    "Isenta ou n\u00e3o tributada e com cobran\u00e7a do ICMS por substitui\u00e7\u00e3o tribut\u00e1ria",
  ],
  ["40", "Isenta"],
  ["41", "N\u00e3o tributada"],
  ["50", "Suspens\u00e3o"],
  ["51", "Diferimento"],
  ["60", "ICMS cobrado anteriormente por substitui\u00e7\u00e3o tribut\u00e1ria"],
  [
    "70",
    "Com redu\u00e7\u00e3o de base de c\u00e1lculo e cobran\u00e7a do ICMS por substitui\u00e7\u00e3o tribut\u00e1ria",
  ],
  ["90", "Outras"],
];
const normTxt = (s: any) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/ +/g, " ")
    .trim();
const OPTS_CST: { v: string; label: string }[] = CSTS_ICMS.map(([v, d]) => ({
  v,
  label: v + " - " + d,
}));
const fmtCfop = (dig: string) => dig.replace(/(\d)(\d{3})$/, "$1.$2");
// Descrição sem o número (a Natureza mostra só o texto)
const semNumCfop = (d: string) => String(d || "").replace(/^\d\.\d{3}\s*[—–-]\s*/, "");
const OPTS_CFOP: { v: string; label: string }[] = CFOPS_CTE.map((c) => {
  const dig = String(c.codigo).replace(/\D/g, "");
  return { v: dig, label: fmtCfop(dig) };
});
// Natureza da Operação usa a mesma tabela (valor = descrição sem número)
const OPTS_NAT: { v: string; label: string }[] = CFOPS_CTE.map((c) => {
  const d = semNumCfop(c.descricao);
  return { v: d, label: d };
});
const OPTS_TIPO_CARGA: { v: string; label: string }[] = (TIPOS_CARGA_ANTT as readonly string[]).map(
  (t) => ({ v: t, label: t }),
);
function Combo({
  label,
  value,
  onPick,
  opts,
  placeholder = "Digite ou selecione",
}: {
  label: string;
  value: string;
  onPick: (v: string) => void;
  opts: { v: string; label: string }[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [txt, setTxt] = useState("");
  const sel = opts.find((o) => o.v === value);
  const q = normTxt(txt);
  const qDig = String(txt || "").replace(/\D/g, "");
  const casa = (o: { v: string; label: string }) => {
    if (!q) return true;
    if (normTxt(o.label).indexOf(q) >= 0 || normTxt(o.v).indexOf(q) >= 0) return true;
    if (qDig) {
      const ld = o.label.replace(/\D/g, ""),
        vd = o.v.replace(/\D/g, "");
      if ((ld && ld.indexOf(qDig) >= 0) || (vd && vd.indexOf(qDig) >= 0)) return true;
    }
    return false;
  };
  const list = opts.filter(casa).slice(0, 40);
  const snap = () => {
    const t = normTxt(txt);
    const td = String(txt || "").replace(/\D/g, "");
    if (!t) return;
    const hit = opts.find((o) => {
      const L = normTxt(o.label),
        V = normTxt(o.v);
      if (L === t || V === t || (t.length >= 2 && (L.indexOf(t) === 0 || V.indexOf(t) === 0)))
        return true;
      if (td.length >= 2) {
        const ld = o.label.replace(/\D/g, ""),
          vd = o.v.replace(/\D/g, "");
        if (ld === td || vd === td || ld.indexOf(td) === 0 || vd.indexOf(td) === 0) return true;
      }
      return false;
    });
    if (hit) onPick(hit.v);
  };
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          className="h-7 text-xs pr-6"
          value={open ? txt : sel ? sel.label : value || ""}
          placeholder={placeholder}
          onFocus={() => {
            setTxt("");
            setOpen(true);
          }}
          onChange={(e) => {
            setTxt(e.target.value);
            setOpen(true);
          }}
          onBlur={() => {
            setOpen(false);
            snap();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
            } else if (e.key === "Enter" && list.length > 0) {
              e.preventDefault();
              onPick(list[0].v);
              setOpen(false);
              (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        {open && list.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-50 mt-0.5 max-h-44 overflow-auto rounded-md border bg-popover shadow-md">
            {list.map((o) => (
              <div
                key={o.v}
                className="cursor-pointer px-2 py-1 text-[11px] hover:bg-accent"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(o.v);
                  setOpen(false);
                }}
              >
                {o.label}
              </div>
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
    const r = await fetch("https://brasilapi.com.br/api/cep/v2/" + d, {
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const j = await r.json();
      const c = j && j.location && j.location.coordinates;
      if (c && c.latitude && c.longitude)
        return { lat: Number(c.latitude), lon: Number(c.longitude) };
    }
  } catch {
    /* proxima fonte */
  }
  try {
    const r = await fetch("https://cep.awesomeapi.com.br/json/" + d, {
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const j = await r.json();
      if (j && j.lat && j.lng) return { lat: Number(j.lat), lon: Number(j.lng) };
    }
  } catch {
    /* proxima fonte */
  }
  try {
    const q = new URLSearchParams({ postalcode: d, country: "Brasil", format: "json", limit: "1" });
    const r = await fetch("https://nominatim.openstreetmap.org/search?" + q.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (r.ok) {
      const j = await r.json();
      if (j && j[0] && j[0].lat && j[0].lon)
        return { lat: Number(j[0].lat), lon: Number(j[0].lon) };
    }
  } catch {
    return null;
  }
  return null;
}
async function geoPorCidade(
  xmun: string,
  uf: string,
): Promise<{ lat: number; lon: number } | null> {
  if (!xmun) return null;
  try {
    const q = new URLSearchParams({
      city: xmun,
      state: uf || "",
      country: "Brasil",
      format: "json",
      limit: "1",
    });
    const r = await fetch("https://nominatim.openstreetmap.org/search?" + q.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (j && j[0] && j[0].lat && j[0].lon) return { lat: Number(j[0].lat), lon: Number(j[0].lon) };
  } catch {
    return null;
  }
  return null;
}
// Cache de geolocalização da sessão (evita reconsultar a mesma cidade/CEP)
const geoCache = new Map<string, { lat: number; lon: number }>();
async function calcDistDur(
  o: { cep: string; xmun: string; uf: string },
  d: { cep: string; xmun: string; uf: string },
): Promise<{ km: string; h: string; ferryKm: number }> {
  const dOrig = String(o.cep || "").replace(/\D/g, "");
  const dDst = String(d.cep || "").replace(/\D/g, "");
  // Cache da sessão: mesma cidade/CEP não reconsulta
  const geoMemo = async (p: { cep: string; xmun: string; uf: string }) => {
    const dd = String(p.cep || "").replace(/\D/g, "");
    const key =
      dd.length === 8
        ? "cep:" + dd
        : "cid:" + p.xmun.trim().toUpperCase() + "/" + p.uf.trim().toUpperCase();
    const hit = geoCache.get(key);
    if (hit) return hit;
    const v = (await geoPorCep(dd)) || (await geoPorCidade(p.xmun, p.uf));
    if (v) geoCache.set(key, v);
    return v;
  };
  const go = await geoMemo(o);
  if (!go)
    throw new Error(
      "Origem nao localizada (CEP " +
        (dOrig || "?") +
        " / " +
        (o.xmun || "?") +
        "-" +
        (o.uf || "?") +
        ") — confira o cadastro",
    );
  const gd = await geoMemo(d);
  if (!gd)
    throw new Error(
      "Destino nao localizado (CEP " +
        (dDst || "?") +
        " / " +
        (d.xmun || "?") +
        "-" +
        (d.uf || "?") +
        ") — confira o cadastro",
    );
  // Roteadores gratuitos (mesmo formato OSRM); corre em paralelo, vence o 1º que responder
  const rotaBases = [
    "https://router.project-osrm.org/route/v1/driving/",
    "https://routing.openstreetmap.de/routed-car/route/v1/driving/",
  ];
  const rotaUrl =
    (base: string) =>
    base +
    go.lon +
    "," +
    go.lat +
    ";" +
    gd.lon +
    "," +
    gd.lat +
    "?overview=false&alternatives=true&steps=true";
  const tentar = async (base: string) => {
    const r = await fetch(rotaUrl(base), { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const jj = await r.json();
    if (!jj || !jj.routes || !jj.routes.length) throw new Error("sem rotas");
    return jj;
  };
  let j: any = null;
  try {
    j = await Promise.any(rotaBases.map(tentar));
  } catch {
    throw new Error("Falha no calculo da rota — tente de novo");
  }
  const routes = (j && j.routes) || [];
  const validas = routes.filter((x: any) => isFinite(Number(x.distance)));
  if (!validas.length) throw new Error("Rota nao encontrada entre os CEPs");
  validas.sort((a: any, b: any) => Number(a.distance) - Number(b.distance));
  const melhor = validas[0];
  const m = Number(melhor.distance);
  // Trechos de balsa (ex.: Belém>Macapá): informa no toast p/ conferência do frete
  let ferryM = 0;
  for (const leg of melhor.legs || [])
    for (const st of (leg as any).steps || [])
      if ((st as any).mode === "ferry") ferryM += Number((st as any).distance) || 0;
  const km = Math.round(m / 1000);
  const volante = km / 60;
  const dias = Math.max(1, Math.ceil(volante / 12));
  const total = Math.floor(volante + (dias > 1 ? 12 * dias : 0) + 0.4);
  return { km: String(km), h: String(total), ferryKm: Math.round(ferryM / 1000) };
}
function PercursosPage() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const voltarCteRef = useRef(false);
  const [busca, setBusca] = useState("");
  const [percTab, setPercTab] = useState("geral");
  const [editing, setEditing] = useState<Percurso | null>(() => {
    // Ida via CT-e (lápis): a linha já vem junto — o editor nasce aberto
    // de primeira, sem esperar o fetch (sem flash da listagem)
    try {
      const ed = JSON.parse(localStorage.getItem("edit_percurso_from_cte") || "null");
      if (ed?.row) return { ...(ed.row as Percurso) };
    } catch {}
    return null;
  });
  // Chegada via CT-e (lápis ou Gerar): cobre a lista até o editor abrir,
  // p/ a transição ser direta sem flash da listagem
  const [chegadaCte, setChegadaCte] = useState(() => {
    try {
      return !!(
        localStorage.getItem("edit_percurso_from_cte") ||
        localStorage.getItem("prefill_percurso_from_cte")
      );
    } catch {
      return false;
    }
  });
  // Saída com volta ao CT-e (salvar ou fechar): cobre a lista de imediato;
  // a navegação desmonta a página atrás do véu (não precisa desligar)
  const [saindoCte, setSaindoCte] = useState(false);
  const [confExcluir, setConfExcluir] = useState<Percurso | null>(null);
  const [calcando, setCalcando] = useState(false);
  // UF acompanha a cidade de entrega (IBGE); carrega uma vez
  const [municipios, setMunicipios] = useState<Mun[]>([]);
  useEffect(() => {
    let vivo = true;
    carregarMunicipios()
      .then((arr) => {
        if (vivo) setMunicipios(arr);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);
  const resolverUfEntrega = () => {
    if (!editing) return;
    const cid = normCidade(editing?.entrega_xmun);
    if (!cid || municipios.length === 0) return;
    const found = municipios.filter((m) => normCidade(m.nome) === cid);
    if (found.length === 0) {
      toast.warning("Cidade não encontrada no IBGE — confira a UF");
      return;
    }
    const atual = String(editing?.entrega_uf || "").toUpperCase();
    const mesma = found.find((m) => m.uf === atual);
    const pick = mesma ?? found[0];
    const atualizado = {
      ...editing,
      entrega_uf: pick.uf,
      ...(pick.id ? { entrega_cmun: String(pick.id) } : {}),
    };
    setEditing((e) => (e ? { ...atualizado, id: e.id } : e));
    if (!mesma && found.length > 1)
      toast.info(`UF ajustada para ${pick.uf} (${found.length} cidades com esse nome)`);
    // Recalcula na hora com os valores novos; trava o debounce p/ não repetir
    try {
      const { ori, dst, sig } = montarRota(atualizado as Percurso);
      rotaRef.current.sig = sig;
      if (!String(dst.cep).replace(/\D/g, "") && !String(dst.xmun).trim()) return;
      void executarCalculo(ori, dst, (editing as Percurso | null)?.id ?? null);
    } catch {}
  };
  const rotaRef = useRef<{ id: string | null; sig: string }>({ id: null, sig: "" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: percursos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["cte-percursos", empresa?.id],
    staleTime: 2 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cte_percursos" as any)
        .select("id,empresa_id,codigo,nome,created_at,rem_nome,rem_cnpj,dest_nome,dest_cnpj,toma_nome,toma_cnpj,coleta_xmun,coleta_uf,entrega_xmun,entrega_uf")
        .eq("empresa_id", empresa!.id)
        .order("codigo")
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Percurso[];
    },
  });

  // Chegada via CT-e (lápis ao lado do percurso): abre a edição direto e volta ao salvar
  useEffect(() => {
    let ed: any = null;
    try {
      ed = JSON.parse(localStorage.getItem("edit_percurso_from_cte") || "null");
    } catch {
      ed = null;
    }
    if (!ed?.id && !ed?.row) return;
    if (!ed.row && !empresa) return; // sem linha junto, espera a empresa p/ buscar
    try {
      localStorage.removeItem("edit_percurso_from_cte");
    } catch {}
    voltarCteRef.current = ed.returnTo === "/fiscal/cte";
    setPercTab("geral");
    setChegadaCte(false);
    // A linha veio junto (abre na hora); atualiza em 2º plano p/ não exibir dado velho
    const idAlvo = ed.id || (ed.row as any)?.id;
    if (!idAlvo) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("cte_percursos" as any)
          .select("*")
          .eq("id", idAlvo)
          .maybeSingle();
        if (data) {
          setEditing({ ...(data as any) });
        } else if (!ed.row) toast.error("Percurso não encontrado");
      } catch {
        if (!ed.row) toast.error("Falha ao abrir percurso");
      } finally {
        setChegadaCte(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa]);
  // Chegada via CT-e (Gerar sem percurso): abre rascunho pré-preenchido e volta ao salvar
  useEffect(() => {
    if (!empresa || !percursos) return;
    let pre: any = null;
    try {
      pre = JSON.parse(localStorage.getItem("prefill_percurso_from_cte") || "null");
    } catch {
      pre = null;
    }
    if (!pre?.remCnpj || !pre?.destCnpj || !pre?.tomaCnpj) return;
    try {
      localStorage.removeItem("prefill_percurso_from_cte");
    } catch {}
    const dg = (v: any) => String(v || "").replace(/\D/g, "");
    const existe = percursos.some(
      (p) =>
        dg(p.rem_cnpj) === dg(pre.remCnpj) &&
        dg(p.dest_cnpj) === dg(pre.destCnpj) &&
        dg(p.toma_cnpj) === dg(pre.tomaCnpj),
    );
    voltarCteRef.current = pre.returnTo === "/fiscal/cte";
    if (existe) {
      toast.success("Percurso já cadastrado — de volta ao CT-e");
      setChegadaCte(false);
      if (voltarCteRef.current) {
        voltarCteRef.current = false;
        navigate({ to: "/fiscal/cte" } as any);
      }
      return;
    }
    const cR0 = contatoByDoc.get(dg(pre.remCnpj)) || {},
      cD0 = contatoByDoc.get(dg(pre.destCnpj)) || {};
    const remX0 = pre.remXMun || (cR0 as any).cidade || "",
      remU0 = pre.remUF || (cR0 as any).uf || "";
    const dstX0 = pre.destXMun || (cD0 as any).cidade || "",
      dstU0 = pre.destUF || (cD0 as any).uf || "";
    const remCep0 = (cR0 as any).cep || "",
      dstCep0 = (cD0 as any).cep || "";
    setEditing({
      id: "",
      codigo: "NOVO",
      nome: ((pre.remNome || "Origem") + " > " + (pre.destNome || "Destino")).slice(0, 80),
      rem_cnpj: dg(pre.remCnpj),
      rem_nome: pre.remNome || "",
      rem_uf: remU0,
      rem_xmun: remX0,
      rem_cep: remCep0,
      dest_cnpj: dg(pre.destCnpj),
      dest_nome: pre.destNome || "",
      dest_uf: dstU0,
      dest_xmun: dstX0,
      dest_cep: dstCep0,
      toma_cnpj: dg(pre.tomaCnpj),
      toma_nome: pre.tomaNome || "",
      coleta_xmun: remX0,
      coleta_uf: remU0,
      entrega_xmun: dstX0,
      entrega_uf: dstU0,
      pis_aliq: "0.65",
      cofins_aliq: "3.00",
      distancia_km: "",
      duracao_horas: "",
    } as Percurso);
    calcDistDur({ cep: remCep0, xmun: remX0, uf: remU0 }, { cep: dstCep0, xmun: dstX0, uf: dstU0 })
      .then((calc) => {
        setEditing((e) =>
          e && !e.id ? { ...e, distancia_km: calc.km, duracao_horas: calc.h } : e,
        );
      })
      .catch(() => {});
    setPercTab("geral");
    setChegadaCte(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa?.id, (percursos || []).length]);

  const { data: seguradorasPerc } = useQuery({
    enabled: !!empresa,
    queryKey: ["seguradoras-perc", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seguradoras" as any)
        .select("id,nome,cnpj,apolice_numero,averbacao")
        .eq("empresa_id", empresa!.id)
        .eq("ativo", true)
        .order("nome")
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string;
        nome: string;
        cnpj: string | null;
        apolice_numero: string | null;
        averbacao: string | null;
      }>;
    },
  });
  const { data: contatosCte } = useQuery({
    enabled: !!empresa,
    queryKey: ["contatos-cte", empresa?.id],
    queryFn: async (): Promise<any[]> => {
      const { data } = await supabase
        .from("contatos" as any)
        .select("id,documento,nome,ie,logradouro,numero,bairro,cidade,uf,cep,telefone")
        .eq("empresa_id", empresa!.id);
      return (data ?? []) as any[];
    },
  });
  const contatoByDoc = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of contatosCte ?? [])
      if ((c as any).documento) m.set(String((c as any).documento).replace(/\D/g, ""), c);
    return m;
  }, [contatosCte]);
  const montarRota = (ed: Percurso) => {
    const digits = (s: any) => String(s || "").replace(/\D/g, "");
    const upper = (s: any) =>
      String(s || "")
        .trim()
        .toUpperCase();
    const temRedesp = digits(ed.redesp_cnpj).length === 14;
    const fbRem = contatoByDoc.get(digits(ed.rem_cnpj)) || {};
    const fbDst = contatoByDoc.get(digits(temRedesp ? ed.redesp_cnpj : ed.dest_cnpj)) || {};
    // Cidade de coleta/entrega explícita e diferente da do cadastro/remetente/
    // destinatário: o CEP (do endereço antigo) NÃO pode vencer — é descartado
    // p/ a geocodificação usar a cidade nova. Ex.: entrega MARABÁ/PA com CEP
    // de MACAPA/AP calculava a distância até Macapá.
    const refCol = normCidade(ed.rem_xmun || (fbRem as any).cidade || "");
    const refDst = normCidade(ed.dest_xmun || (fbDst as any).cidade || "");
    const colMudou =
      !!normCidade(ed.coleta_xmun) && !!refCol && normCidade(ed.coleta_xmun) !== refCol;
    const dstMudou =
      !!normCidade(ed.entrega_xmun) && !!refDst && normCidade(ed.entrega_xmun) !== refDst;
    const ori = {
      cep: colMudou ? "" : String(ed.rem_cep || fbRem.cep || ""),
      xmun: String(ed.coleta_xmun || ed.rem_xmun || fbRem.cidade || ""),
      uf: String(ed.coleta_uf || ed.rem_uf || fbRem.uf || ""),
    };
    const dst = temRedesp
      ? {
          cep: String(ed.redesp_cep || ""),
          xmun: String(ed.entrega_xmun || ed.redesp_xmun || ""),
          uf: String(ed.entrega_uf || ed.redesp_uf || ""),
        }
      : {
          cep: dstMudou ? "" : String(ed.dest_cep || fbDst.cep || ""),
          xmun: String(ed.entrega_xmun || ed.dest_xmun || fbDst.cidade || ""),
          uf: String(ed.entrega_uf || ed.dest_uf || fbDst.uf || ""),
        };
    const sig =
      [digits(ori.cep), upper(ori.xmun), upper(ori.uf)].join("/") +
      ">" +
      [digits(dst.cep), upper(dst.xmun), upper(dst.uf)].join("/");
    return { ori, dst, sig };
  };
  // Cálculo compartilhado (botão, debounce e pós-UF): grava km/h se for o mesmo registro
  const executarCalculo = async (
    ori: { cep: string; xmun: string; uf: string },
    dst: { cep: string; xmun: string; uf: string },
    idAlvo: string | null,
  ) => {
    setCalcando(true);
    try {
      const calc = await calcDistDur(ori, dst);
      setEditing((e) => (e && e.id === idAlvo ? { ...e, distancia_km: calc.km, duracao_horas: calc.h } : e));
      toast.success("Percurso recalculado");
    } catch (e: any) {
      toast.error(e && e.message ? e.message : "Falha no recalculo");
    } finally {
      setCalcando(false);
    }
  };
  const recalcular = async () => {
    if (!editing) return;
    const { ori, dst } = montarRota(editing);
    await executarCalculo(ori, dst, editing.id);
  };
  useEffect(() => {
    if (!editing) {
      rotaRef.current = { id: null, sig: "" };
      return;
    }
    const { ori, dst, sig } = montarRota(editing);
    if (rotaRef.current.id !== editing.id) {
      rotaRef.current = { id: editing.id, sig };
      return;
    }
    if (sig === rotaRef.current.sig) return;
    rotaRef.current.sig = sig;
    if (!String(dst.cep).replace(/\D/g, "") && !String(dst.xmun).trim()) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void executarCalculo(ori, dst, editing.id);
    }, 900);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    editing ? editing.id : null,
    editing ? editing.rem_cnpj : "",
    editing ? editing.rem_cep : "",
    editing ? editing.rem_xmun : "",
    editing ? editing.rem_uf : "",
    editing ? editing.coleta_xmun : "",
    editing ? editing.coleta_uf : "",
    editing ? editing.dest_cnpj : "",
    editing ? editing.dest_cep : "",
    editing ? editing.dest_xmun : "",
    editing ? editing.dest_uf : "",
    editing ? editing.entrega_xmun : "",
    editing ? editing.entrega_uf : "",
    editing ? editing.redesp_cnpj : "",
    editing ? editing.redesp_cep : "",
    editing ? editing.redesp_xmun : "",
    editing ? editing.redesp_uf : "",
  ]);
  const salvar = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("Nada para salvar");
      const pend: string[] = [];
      // Coleta/entrega: cidade sem UF gera CT-e com fim errado (UF cai no
      // fallback da NF-e). Exige a UF junto.
      if (String((editing as any).coleta_xmun || "").trim() && !String((editing as any).coleta_uf || "").trim())
        pend.push("UF da coleta");
      if (String((editing as any).entrega_xmun || "").trim() && !String((editing as any).entrega_uf || "").trim())
        pend.push("UF da entrega");
      for (const p of [
        { k: "consig", label: "Consignatario" },
        { k: "redesp", label: "Redespacho" },
      ]) {
        const doc = String((editing as any)[p.k + "_cnpj"] || "").replace(/\D/g, "");
        const ie = limparIE((editing as any)[p.k + "_ie"]);
        const uf = String((editing as any)[p.k + "_uf"] || "").toUpperCase();
        if (doc.length > 0 && !ie) pend.push("Inscricao Estadual de " + p.label + " (ou ISENTO)");
        else if (doc.length > 0 && ie) {
          const v = validarIE(uf, ie);
          if (!v.ok)
            pend.push(
              "IE de " +
                p.label +
                " fora do padrao de " +
                (uf || "?") +
                " (espera " +
                v.esperados.join(" ou ") +
                " digitos, tem " +
                v.digitos +
                ")",
            );
        }
      }
      if (pend.length > 0) throw new Error("Pendencias: " + pend.join("; "));
      const payload: Record<string, any> = {};
      for (const k of EDITAVEIS) {
        const v = (editing as any)[k];
        const vv =
          k.endsWith("_ie")
            ? limparIE(v)
            : k.endsWith("_cnpj")
              ? String(v || "").replace(/\D/g, "")
              : v;
        payload[k] =
          typeof vv === "string" ? vv.toUpperCase() : (vv ?? (k === "seg_repassar" ? false : ""));
      }
      for (const p of ["rem", "dest", "toma"]) {
        const c = contatoByDoc.get(String(editing[p + "_cnpj"] || "").replace(/\D/g, "")) || {};
        const fb: Record<string, any> = {
          ie: c.ie,
          logradouro: c.logradouro,
          nro: c.numero,
          bairro: c.bairro,
          xmun: c.cidade,
          uf: c.uf,
          cep: c.cep,
          fone: c.telefone,
        };
        for (const k of Object.keys(fb)) {
          const col = p + "_" + k;
          if (!payload[col] && fb[k]) payload[col] = fb[k];
        }
      }
      // cMun de coleta/entrega pelo IBGE (a tela não tem campo p/ código):
      // sem ele o CT-e herda o cMun da NF-e e a UF sai errada (ex. MARABA/AP).
      const cmunDe = (xmun: any, uf: any) => {
        const cands = (municipios || []).filter((m) => normCidade(m.nome) === normCidade(xmun));
        if (!cands.length) return "";
        const same =
          cands.find((m) => String(m.uf || "").toUpperCase() === String(uf || "").toUpperCase()) ||
          cands[0];
        return same?.id ? String(same.id) : "";
      };
      if (!payload.coleta_cmun && payload.coleta_xmun && payload.coleta_uf) {
        const c = cmunDe(payload.coleta_xmun, payload.coleta_uf);
        if (c) payload.coleta_cmun = c;
      }
      if (!payload.entrega_cmun && payload.entrega_xmun && payload.entrega_uf) {
        const c = cmunDe(payload.entrega_xmun, payload.entrega_uf);
        if (c) payload.entrega_cmun = c;
      }
      if (!empresa) throw new Error("Empresa nao selecionada");
      const digits = (s: any) => String(s || "").replace(/\D/g, "");
      const upper = (s: any) =>
        String(s || "")
          .trim()
          .toUpperCase();
      const temRedesp = digits(payload.redesp_cnpj).length === 14;
      // Mesma regra da tela: cidade explícita diferente do cadastro descarta o CEP
      // antigo p/ a geocodificação (senão o salvar recalcula p/ a cidade errada e
      // grava por cima do valor certo). Ex.: entrega MARABÁ/PA com CEP de MACAPÁ/AP.
      const fbRemS = contatoByDoc.get(digits(String((editing as any).rem_cnpj || ""))) || {};
      const fbDstS = contatoByDoc.get(digits(String((editing as any).dest_cnpj || ""))) || {};
      const refColS = normCidade((editing as any).rem_xmun || (fbRemS as any).cidade || "");
      const refDstS = normCidade((editing as any).dest_xmun || (fbDstS as any).cidade || "");
      const colMudouS =
        !!normCidade(payload.coleta_xmun) && !!refColS && normCidade(payload.coleta_xmun) !== refColS;
      const dstMudouS =
        !!normCidade(payload.entrega_xmun) && !!refDstS && normCidade(payload.entrega_xmun) !== refDstS;
      const redMudouS =
        !!normCidade(payload.entrega_xmun) &&
        !!normCidade(payload.redesp_xmun) &&
        normCidade(payload.entrega_xmun) !== normCidade(payload.redesp_xmun);
      const sig = (cep: any, xmun: any, uf: any) => [digits(cep), upper(xmun), upper(uf)].join("/");
      const oriOrg = {
        cep: colMudouS ? "" : String(payload.rem_cep || ""),
        xmun: String(payload.coleta_xmun || payload.rem_xmun || ""),
        uf: String(payload.coleta_uf || payload.rem_uf || ""),
      };
      const dstOrg = temRedesp
        ? {
            cep: redMudouS ? "" : String(payload.redesp_cep || ""),
            xmun: String(payload.entrega_xmun || payload.redesp_xmun || ""),
            uf: String(payload.entrega_uf || payload.redesp_uf || ""),
          }
        : {
            cep: dstMudouS ? "" : String(payload.dest_cep || ""),
            xmun: String(payload.entrega_xmun || payload.dest_xmun || ""),
            uf: String(payload.entrega_uf || payload.dest_uf || ""),
          };
      const rotaAtual =
        sig(oriOrg.cep, oriOrg.xmun, oriOrg.uf) + ">" + sig(dstOrg.cep, dstOrg.xmun, dstOrg.uf);
      const { data: salvo } = await supabase
        .from("cte_percursos" as any)
        .select(
          "rem_cep,rem_xmun,coleta_xmun,coleta_uf,rem_uf,dest_cep,dest_xmun,dest_uf,redesp_cnpj,redesp_cep,redesp_xmun,redesp_uf",
        )
        .eq("id", editing.id)
        .maybeSingle();
      const sv: any = salvo || {};
      const temRedespSv = digits(sv.redesp_cnpj).length === 14;
      const refColSv = normCidade(sv.rem_xmun || "");
      const refDstSv = normCidade(sv.dest_xmun || "");
      const colMudouSv =
        !!normCidade(sv.coleta_xmun) && !!refColSv && normCidade(sv.coleta_xmun) !== refColSv;
      const dstMudouSv =
        !!normCidade(sv.entrega_xmun) && !!refDstSv && normCidade(sv.entrega_xmun) !== refDstSv;
      const redMudouSv =
        !!normCidade(sv.entrega_xmun) &&
        !!normCidade(sv.redesp_xmun) &&
        normCidade(sv.entrega_xmun) !== normCidade(sv.redesp_xmun);
      const rotaSalva =
        sig(colMudouSv ? "" : sv.rem_cep, sv.coleta_xmun || sv.rem_xmun, sv.coleta_uf || sv.rem_uf) +
        ">" +
        (temRedespSv
          ? sig(redMudouSv ? "" : sv.redesp_cep, sv.entrega_xmun || sv.redesp_xmun, sv.entrega_uf || sv.redesp_uf)
          : sig(dstMudouSv ? "" : sv.dest_cep, sv.entrega_xmun || sv.dest_xmun, sv.entrega_uf || sv.dest_uf));
      const mudouRota = rotaAtual !== rotaSalva;
      if (!payload.distancia_km || !payload.duracao_horas || mudouRota) {
        const calc = await calcDistDur(oriOrg, dstOrg);
        if (mudouRota) {
          payload.distancia_km = calc.km;
          payload.duracao_horas = calc.h;
          toast.success("Percurso recalculado");
        } else {
          if (!payload.distancia_km) payload.distancia_km = calc.km;
          if (!payload.duracao_horas) payload.duracao_horas = calc.h;
        }
        setEditing((e) =>
          e
            ? { ...e, distancia_km: payload.distancia_km, duracao_horas: payload.duracao_horas }
            : e,
        );
      }
      if (!editing.id) {
        const remD = digits(payload.rem_cnpj || (editing as any).rem_cnpj);
        const dstD = digits(payload.dest_cnpj || (editing as any).dest_cnpj);
        const tomD = digits(payload.toma_cnpj || (editing as any).toma_cnpj);
        if (remD.length !== 14 || dstD.length !== 14 || tomD.length !== 14)
          throw new Error("Remetente, destinatário e tomador precisam de CNPJ válido");
        const { data: mx } = await supabase
          .from("cte_percursos" as any)
          .select("codigo")
          .eq("empresa_id", empresa.id)
          .order("codigo", { ascending: false })
          .limit(1);
        const last = parseInt(((mx as any[])?.[0] as any)?.codigo || "0", 10) || 0;
        const codigo = String(last + 1).padStart(4, "0");
        const nome = String(
          (editing as any).nome ||
            ((editing as any).rem_nome || "Origem") +
              " > " +
              ((editing as any).dest_nome || "Destino"),
        )
          .slice(0, 80)
          .toUpperCase();
        const { data: ins, error: insErr } = await supabase
          .from("cte_percursos" as any)
          .insert({
            empresa_id: empresa.id,
            codigo,
            nome,
            rem_cnpj: remD,
            rem_nome: (editing as any).rem_nome || "",
            dest_cnpj: dstD,
            dest_nome: (editing as any).dest_nome || "",
            toma_cnpj: tomD,
            toma_nome: (editing as any).toma_nome || "",
            ...payload,
          })
          .select("id")
          .maybeSingle();
        if (insErr) throw insErr;
      } else {
        const { error: updErr } = await supabase
          .from("cte_percursos" as any)
          .update(payload)
          .eq("id", editing.id);
        if (updErr) throw updErr;
      }
      const wbs = (["consig", "redesp"] as const).map(async (p) => {
        const doc = String(payload[p + "_cnpj"] || "").replace(/\D/g, "");
        if (doc.length !== 14) return;
        const crow: Record<string, any> = {
          nome: payload[p + "_nome"] || null,
          ie: payload[p + "_ie"] || null,
          uf: payload[p + "_uf"] || null,
          cidade: payload[p + "_xmun"] || null,
          logradouro: payload[p + "_logradouro"] || null,
          numero: payload[p + "_nro"] || null,
          bairro: payload[p + "_bairro"] || null,
          cep: payload[p + "_cep"] || null,
        };
        const { data: ex } = await supabase
          .from("contatos" as any)
          .select("id")
          .eq("empresa_id", empresa.id)
          .eq("documento", doc)
          .maybeSingle();
        if (ex) {
          await supabase
            .from("contatos" as any)
            .update(crow)
            .eq("id", (ex as any).id);
        } else {
          await supabase
            .from("contatos" as any)
            .insert({ empresa_id: empresa.id, tipo: "cliente", documento: doc, ...crow } as any);
        }
      });
      await Promise.all([...wbs]);
      qc.invalidateQueries({ queryKey: ["contatos-cte", empresa.id] });
    },
    onSuccess: () => {
      toast.success("Percurso salvo");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["cte-percursos", empresa?.id] });
      if (voltarCteRef.current) {
        voltarCteRef.current = false;
        navigate({ to: "/fiscal/cte" } as any);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Fecha o editor voltando ao CT-e em andamento (lápis), se for o caso
  const fecharVoltandoCte = () => {
    if (voltarCteRef.current) {
      // Cobre a lista na hora: a navegação desmonta a página atrás do véu
      setSaindoCte(true);
      setEditing(null);
      voltarCteRef.current = false;
      navigate({ to: "/fiscal/cte" } as any);
      return;
    }
    setEditing(null);
  };
  // Salvar com volta ao CT-e: cobre a lista de imediato (re "saindoCte")
  const salvarPercurso = () => {
    if (voltarCteRef.current) setSaindoCte(true);
    if (editing && !salvar.isPending) salvar.mutate();
  };
  const excluir = useMutation({
    mutationFn: async (id: string) => {
      // Não exclui percurso com CT-e feito (rascunho ou emitido): compara o trio
      const alvo = (percursos || []).find((p) => p.id === id);
      const dg = (v: any) => String(v || "").replace(/\D/g, "");
      const trio = [dg(alvo?.rem_cnpj), dg(alvo?.dest_cnpj), dg(alvo?.toma_cnpj)];
      if (alvo && trio.every(Boolean)) {
        const { data: docs } = await supabase
          .from("cte_documentos" as any)
          .select("id,numero,status,xml_assinado")
          .eq("empresa_id", empresa!.id)
          .limit(500);
        for (const doc of ((docs as any[]) || [])) {
          let usa = false;
          try {
            const p = JSON.parse((doc as any).xml_assinado || "{}");
            const f = p.form || {};
            const n0 = (p.nfs || [])[0] || {};
            usa =
              dg(f.cnpjTomador) === trio[2] &&
              dg(n0.emitCnpj) === trio[0] &&
              dg(n0.destCnpj) === trio[1];
          } catch {
            usa = false;
          }
          if (usa) {
            const st = String((doc as any).status || "");
            const num = (doc as any).numero ? ` nº ${(doc as any).numero}` : "";
            throw new Error(
              `Percurso em uso no CT-e${num} (${st || "registrado"}) — exclua o documento primeiro`,
            );
          }
        }
      }
      const { error } = await supabase
        .from("cte_percursos" as any)
        .delete()
        .eq("id", id);
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
    return {
      ie: g("ie", "ie"),
      lgr: g("logradouro", "logradouro"),
      nro: g("nro", "numero"),
      bai: g("bairro", "bairro"),
      cid: g("xmun", "cidade"),
      uf: g("uf", "uf"),
      cep: g("cep", "cep"),
      fone: g("fone", "telefone"),
    };
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
        for (const k of ["nome", "ie", "uf", "xmun", "cep", "logradouro", "nro", "bairro"]) {
          if ((editing as any)[p + "_" + k]) {
            (patch as any)[p + "_" + k] = "";
            has = true;
          }
        }
        if (has) {
          changed = true;
          lastLookupParte.current[p] = "";
        }
      }
    }
    if (changed) setEditing((e) => (e ? { ...e, ...patch } : e));
  }, [editing?.consig_cnpj, editing?.redesp_cnpj]);
  // Amarracao: prioridade da entrega = redespacho > destinatario.
  // Mas cidade de entrega manual é preservada: só preenche a partir do
  // destinatário quando a entrega está vazia (entrega pode diferir da
  // cidade do dest., ex.: dest MACAPÁ/AP com entrega em MARABÁ/PA).
  useEffect(() => {
    if (!editing) return;
    const rx = (editing.redesp_xmun || "").trim();
    const ru = (editing.redesp_uf || "").trim();
    const hasRed = (editing.redesp_cnpj || "").replace(/\D/g, "").length === 14 && (rx || ru);
    if (hasRed) {
      if ((editing.entrega_xmun || "") !== rx || (editing.entrega_uf || "") !== ru) {
        setEditing((e) => (e ? { ...e, entrega_xmun: rx, entrega_uf: ru } : e));
      }
      return;
    }
    if (
      !(editing.entrega_xmun || "").trim() &&
      ((editing.dest_xmun || "").trim() || (editing.dest_uf || "").trim())
    ) {
      setEditing((e) =>
        e ? { ...e, entrega_xmun: e.dest_xmun || "", entrega_uf: e.dest_uf || "" } : e,
      );
    }
  }, [
    editing?.redesp_cnpj,
    editing?.redesp_xmun,
    editing?.redesp_uf,
    editing?.dest_xmun,
    editing?.dest_uf,
  ]);
  // Amarracao: coleta segue o remetente (mesma regra: só preenche se vazia).
  useEffect(() => {
    if (!editing) return;
    const nx = (editing.rem_xmun || "").trim();
    const nu = (editing.rem_uf || "").trim();
    if (!(editing.coleta_xmun || "").trim() && (nx || nu)) {
      setEditing((e) => (e ? { ...e, coleta_xmun: nx, coleta_uf: nu } : e));
    }
  }, [editing?.rem_xmun, editing?.rem_uf]);
  const lastLookupParte = useRef<Record<string, string>>({});
  const lookupParte = async (p: "consig" | "redesp", digits: string) => {
    const d = digits.replace(/\D/g, "").slice(0, 14);
    if (d.length !== 14 || !empresa) return;
    if (lastLookupParte.current[p] === d) return;
    lastLookupParte.current[p] = d;
    try {
      const row = contatoByDoc.get(d);
      let found: any = row
        ? {
            nome: row.nome || "",
            ie: row.ie || "",
            uf: row.uf || "",
            cidade: row.cidade || "",
            cep: String(row.cep || "").replace(/\D/g, ""),
            logradouro: row.logradouro || "",
            numero: row.numero || "",
            bairro: row.bairro || "",
            fone: row.telefone || "",
            fromContatos: true,
            _id: row.id,
          }
        : null;
      if (!found || !found.logradouro || !found.cidade) {
        let j: any = null;
        for (const url of [
          "https://brasilapi.com.br/api/cnpj/v1/" + d,
          "https://receitaws.com.br/v1/cnpj/" + d,
        ]) {
          try {
            const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (r.ok) {
              j = await r.json();
              break;
            }
          } catch {}
        }
        if (j && j.status !== "ERROR") {
          const api = {
            nome: j.razao_social || j.nome || "",
            ie: "",
            uf: j.uf || j.state || "",
            cidade: j.municipio || j.city || "",
            cep: String(j.cep || j.zip || "").replace(/\D/g, ""),
            logradouro: j.logradouro || j.street || "",
            numero: String(j.numero || j.number || ""),
            bairro: j.bairro || j.district || "",
            fone: j.ddd_telefone_1 || j.telefone || j.phone || "",
          };
          found = {
            nome: (found && found.nome) || api.nome,
            ie: (found && found.ie) || "",
            uf: (found && found.uf) || api.uf,
            cidade: (found && found.cidade) || api.cidade,
            cep: (found && found.cep) || api.cep,
            logradouro: (found && found.logradouro) || api.logradouro,
            numero: (found && found.numero) || api.numero,
            bairro: (found && found.bairro) || api.bairro,
            fone: (found && found.fone) || api.fone,
            fromContatos: !!(found && found.nome),
            _id: found && (found as any)._id,
          };
          if (api.cidade || api.logradouro) {
            if (found._id) {
              await supabase
                .from("contatos" as any)
                .update({
                  logradouro: api.logradouro || null,
                  numero: api.numero || null,
                  bairro: api.bairro || null,
                  cidade: api.cidade || null,
                  uf: api.uf || null,
                  cep: api.cep || null,
                  telefone: api.fone || null,
                })
                .eq("id", found._id);
            } else if (api.nome || api.cidade) {
              await supabase
                .from("contatos" as any)
                .insert({
                  empresa_id: empresa.id,
                  nome: api.nome || d,
                  tipo: "cliente",
                  documento: d,
                  uf: api.uf || null,
                  cidade: api.cidade || null,
                  logradouro: api.logradouro || null,
                  numero: api.numero || null,
                  bairro: api.bairro || null,
                  cep: api.cep || null,
                  telefone: api.fone || null,
                } as any);
            }
            qc.invalidateQueries({ queryKey: ["contatos-cte", empresa.id] });
          }
        }
      }
      if (!found || (!found.nome && !found.cidade && !found.logradouro)) {
        toast.error("CNPJ nao encontrado");
        return;
      }
      setEditing((e) =>
        e
          ? {
              ...e,
              [p + "_nome"]: found.nome || (e as any)[p + "_nome"] || "",
              [p + "_ie"]: found.ie || (e as any)[p + "_ie"] || "",
              [p + "_uf"]: found.uf || (e as any)[p + "_uf"] || "",
              [p + "_xmun"]: found.cidade || (e as any)[p + "_xmun"] || "",
              [p + "_cep"]: found.cep || (e as any)[p + "_cep"] || "",
              [p + "_logradouro"]: found.logradouro || (e as any)[p + "_logradouro"] || "",
              [p + "_nro"]: found.numero || (e as any)[p + "_nro"] || "",
              [p + "_bairro"]: found.bairro || (e as any)[p + "_bairro"] || "",
            }
          : e,
      );
      toast.success(p === "consig" ? "Consignatario localizado" : "Redespacho localizado");
    } catch (e: any) {
      toast.error(e.message || "Falha ao buscar CNPJ");
    }
  };
  // Localiza Remetente/Destinatário/Tomador pelo CNPJ (percurso novo/avulso)
  const lookupChave = async (kind: "rem" | "dest" | "toma", digits: string) => {
    const d = String(digits || "").replace(/\D/g, "");
    if (d.length !== 14 || !empresa) return;
    try {
      const row = contatoByDoc.get(d);
      let nome = row?.nome || "",
        cidade = row?.cidade || "",
        uf = row?.uf || "",
        cep = String(row?.cep || "").replace(/\D/g, "");
      if (!nome || !cidade) {
        let j: any = null;
        for (const url of [
          "https://brasilapi.com.br/api/cnpj/v1/" + d,
          "https://receitaws.com.br/v1/cnpj/" + d,
        ]) {
          try {
            const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (r.ok) {
              j = await r.json();
              break;
            }
          } catch {}
        }
        if (j && j.status !== "ERROR") {
          nome = nome || j.razao_social || j.nome || "";
          cidade = cidade || j.municipio || j.city || "";
          uf = uf || j.uf || j.state || "";
          cep = cep || String(j.cep || j.zip || "").replace(/\D/g, "");
        }
      }
      if (!nome && !cidade) {
        toast.error("CNPJ nao encontrado");
        return;
      }
      setEditing((e: any) =>
        e
          ? {
              ...e,
              [kind + "_cnpj"]: maskDoc(d),
              [kind + "_nome"]: nome || e[kind + "_nome"] || "",
              [kind + "_xmun"]: cidade || e[kind + "_xmun"] || "",
              [kind + "_uf"]: uf || e[kind + "_uf"] || "",
              [kind + "_cep"]: cep || e[kind + "_cep"] || "",
              ...(kind === "dest"
                ? {
                    entrega_xmun: cidade || e.entrega_xmun || "",
                    entrega_uf: uf || e.entrega_uf || "",
                  }
                : {}),
            }
          : e,
      );
      toast.success("Localizado");
    } catch (e: any) {
      toast.error(e.message || "Falha ao buscar CNPJ");
    }
  };
  // Percurso avulso: rascunho em branco p/ cadastro manual
  const novoAvulso = () => {
    voltarCteRef.current = false;
    setEditing({
      id: "",
      codigo: "NOVO",
      nome: "",
      rem_cnpj: "",
      rem_nome: "",
      rem_xmun: "",
      rem_uf: "",
      rem_cep: "",
      dest_cnpj: "",
      dest_nome: "",
      dest_xmun: "",
      dest_uf: "",
      dest_cep: "",
      toma_cnpj: "",
      toma_nome: "",
      coleta_xmun: "",
      coleta_uf: "",
      entrega_xmun: "",
      entrega_uf: "",
      pis_aliq: "0.65",
      cofins_aliq: "3.00",
      distancia_km: "",
      duracao_horas: "",
    } as Percurso);
    setPercTab("geral");
  };
  const set = (k: string, v: any) => setEditing((e: any) => (e ? { ...e, [k]: v } : e));
  const q = busca.trim().toLowerCase();
  // Ordenação da lista (padrão: código crescente)
  const [ordPerc, setOrdPerc] = useState<{ chave: string; dir: 1 | -1 }>({
    chave: "codigo",
    dir: 1,
  });
  const lista = (percursos || [])
    .filter((p) => {
      if (!q) return true;
      return [
        p.codigo,
        p.nome,
        p.rem_nome,
        p.rem_cnpj,
        p.dest_nome,
        p.dest_cnpj,
        p.toma_nome,
        p.toma_cnpj,
      ].some((v) =>
        String(v || "")
          .toLowerCase()
          .includes(q),
      );
    })
    .sort((a: any, b: any) => {
      const val = (p: any) =>
        ordPerc.chave === "codigo"
          ? Number.parseInt(String(p.codigo || ""), 10) || 0
          : ordPerc.chave === "nome"
            ? String(p.nome || "")
            : ordPerc.chave === "rota"
              ? String(p.rem_nome || "") + " " + String(p.dest_nome || "")
              : ordPerc.chave === "toma"
                ? String(p.toma_nome || "")
                : ordPerc.chave === "coleta"
                  ? String(p.coleta_xmun || "") + " " + String(p.entrega_xmun || "")
                  : "";
      const va = val(a) as any;
      const vb = val(b) as any;
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va || "").localeCompare(String(vb || ""), "pt-BR", { numeric: true });
      return cmp * ordPerc.dir;
    });
  const THP = ({ k, label, className }: { k: string; label: string; className?: string }) => (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-1 uppercase hover:text-foreground"
        onClick={() =>
          setOrdPerc((o) =>
            o.chave !== k ? { chave: k, dir: 1 } : o.dir === 1 ? { chave: k, dir: -1 } : { chave: "codigo", dir: 1 },
          )
        }
        title="Ordenar"
      >
        {label}
        <span className="text-[9px] w-3 inline-block">
          {ordPerc.chave === k ? (ordPerc.dir === 1 ? "▲" : "▼") : ""}
        </span>
      </button>
    </TableHead>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {(saindoCte || (chegadaCte && !editing)) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <PageHeader
        eyebrow="Fiscal"
        title="Percursos"
        description="Rotas padronizadas do CT-e (remetente + destinatário + tomador). Aplicadas automaticamente na emissão."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Input
            className="h-10 rounded-xl shadow-sm"
            placeholder="Buscar por código, nome, empresa ou CNPJ..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
        <Button size="sm" className="h-10 shrink-0 whitespace-nowrap rounded-xl px-5 shadow-sm transition-all hover:-translate-y-px hover:shadow-md" onClick={novoAvulso}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Novo percurso
        </Button>
      </div>

      <Card className="overflow-hidden rounded-2xl shadow-panel">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2.5 p-4 sm:p-6">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-muted/30" />)}</div>
          ) : lista.length === 0 ? (
            <div className="p-4 sm:p-6">
              <EmptyState
                icon={RoadIcon}
                title="Nenhum percurso"
                description="Os percursos são criados automaticamente ao emitir CT-e ou salvar rascunho."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <THP k="codigo" label="Código" className="w-20" />
                  <THP k="nome" label="Nome" />
                  <THP k="rota" label="Remetente → Destinatário" />
                  <THP k="toma" label="Tomador" />
                  <THP k="coleta" label="Coleta / Entrega" />
                  <TableHead className="w-24 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((p) => (
                  <TableRow key={p.id} className="transition-colors hover:bg-accent/30">
                    <TableCell>
                      <Badge className="bg-primary/15 font-mono text-primary shadow-sm">
                        {p.codigo || "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[260px] truncate" title={p.nome}>
                      {p.nome}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="block truncate max-w-[280px]">{p.rem_nome || "—"}</span>
                      <span className="block text-muted-foreground">→ {p.dest_nome || "—"}</span>
                    </TableCell>
                    <TableCell className="text-xs max-w-[200px] truncate">
                      {p.toma_nome || fmtDoc(p.toma_cnpj)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.coleta_xmun || "—"}/{p.coleta_uf || "—"} → {p.entrega_xmun || "—"}/
                      {p.entrega_uf || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-lg"
                          title="Editar"
                          onClick={async () => {
                            // A listagem traz poucas colunas: busca a linha
                            // completa antes de editar, senão o salvar
                            // sobrescreve CFOP/natureza/alíquotas/seguro com vazio.
                            let full: any = null;
                            try {
                              const { data } = await supabase
                                .from("cte_percursos" as any)
                                .select("*")
                                .eq("id", p.id)
                                .maybeSingle();
                              full = data || null;
                            } catch {}
                            setEditing({ ...(full ?? p) });
                            setPercTab("geral");
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-lg text-destructive"
                          title="Excluir"
                          onClick={() => setConfExcluir(p)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={!!editing}
        onOpenChange={(v) => {
          if (!v) fecharVoltandoCte();
        }}
      >
        <DialogContent
          className="p-3 sm:p-4"
          onKeyDown={(event) => {
            // Enter em campo de texto salva o percurso (a validação do salvar
            // barra quando faltar obrigatório; textarea quebra linha)
            if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
              const t = event.target as HTMLElement;
              // Só no diálogo principal: ignora popovers/combos e diálogos aninhados
              const dlg = t.closest('[role="dialog"]');
              if (dlg && dlg !== event.currentTarget) return;
              if (
                t.tagName === "INPUT" &&
                !["checkbox", "radio", "file", "button", "submit", "hidden"].includes((t as HTMLInputElement).type) &&
                !t.closest('[role="combobox"],[role="listbox"],[role="option"],[data-radix-popper-content-wrapper]')
              ) {
                event.preventDefault();
                if (editing && !salvar.isPending) salvarPercurso();
              }
            }
          }}
        >
          <div className="flex flex-col h-full gap-2">
            <DialogHeader>
              <DialogTitle className="text-sm">
                {editing?.id ? (
                  <>
                    Editar percurso {editing?.codigo || ""} — {editing?.nome || ""}
                  </>
                ) : (
                  <>Novo percurso</>
                )}
              </DialogTitle>
            </DialogHeader>
            {editing && (
              <Tabs
                value={percTab}
                onValueChange={setPercTab}
                className="flex-1 flex flex-col min-h-0"
              >
                <TabsList className="h-9 w-fit rounded-xl">
                  <TabsTrigger
                    value="geral"
                    className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                  >
                    Geral
                  </TabsTrigger>
                  <TabsTrigger
                    value="seguro"
                    className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary"
                  >
                    Seguro
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="geral" className="mt-2 space-y-1 flex-1 flex flex-col min-h-0">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                    <div className="md:col-span-3 flex flex-col justify-between gap-2">
                      {editing.id ? (
                        <>
                          <Parte titulo="Remetente" nome={editing.rem_nome} doc={editing.rem_cnpj} />
                          <Parte
                            titulo="Destinatário"
                            nome={editing.dest_nome}
                            doc={editing.dest_cnpj}
                          />
                          <Parte titulo="Tomador" nome={editing.toma_nome} doc={editing.toma_cnpj} />
                        </>
                      ) : (
                        <>
                          <ChaveEdit
                            titulo="Remetente"
                            nome={editing.rem_nome}
                            doc={editing.rem_cnpj}
                            onNome={(v) => set("rem_nome", v)}
                            onDoc={(v) => set("rem_cnpj", v)}
                            onBlurDoc={() => lookupChave("rem", editing.rem_cnpj)}
                          />
                          <ChaveEdit
                            titulo="Destinatário"
                            nome={editing.dest_nome}
                            doc={editing.dest_cnpj}
                            onNome={(v) => set("dest_nome", v)}
                            onDoc={(v) => set("dest_cnpj", v)}
                            onBlurDoc={() => lookupChave("dest", editing.dest_cnpj)}
                          />
                          <ChaveEdit
                            titulo="Tomador"
                            nome={editing.toma_nome}
                            doc={editing.toma_cnpj}
                            onNome={(v) => set("toma_nome", v)}
                            onDoc={(v) => set("toma_cnpj", v)}
                            onBlurDoc={() => lookupChave("toma", editing.toma_cnpj)}
                          />
                        </>
                      )}
                    </div>
                    <div className="flex h-full flex-col rounded-xl border px-2 py-1">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] font-semibold">Coleta / Entrega</p>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          title="Recalcular distancia e duracao"
                          onClick={recalcular}
                          disabled={calcando}
                        >
                          <RefreshCw className={"h-3 w-3" + (calcando ? " animate-spin" : "")} />
                        </Button>
                      </div>
                      <div className="flex-1 flex flex-col gap-1 py-0.5">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-muted-foreground w-12 shrink-0">
                            Coleta
                          </span>
                          <Input
                            className="h-6 text-[11px] flex-1 min-w-0 bg-transparent dark:bg-transparent"
                            readOnly
                            value={editing.coleta_xmun || ""}
                            onChange={(e) => set("coleta_xmun", e.target.value)}
                          />
                          <span className="text-[9px] text-muted-foreground shrink-0">UF</span>
                          <Input
                            className="h-6 text-[11px] w-12 text-center shrink-0 bg-transparent dark:bg-transparent"
                            readOnly
                            value={editing.coleta_uf || ""}
                            onChange={(e) => set("coleta_uf", e.target.value.toUpperCase())}
                            maxLength={2}
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-muted-foreground w-12 shrink-0">
                            Entrega
                          </span>
                          <Input
                            className="h-6 text-[11px] flex-1 min-w-0"
                            value={editing.entrega_xmun || ""}
                            onChange={(e) => set("entrega_xmun", e.target.value.toUpperCase())}
                            onBlur={() => resolverUfEntrega()}
                          />
                          <span className="text-[9px] text-muted-foreground shrink-0">UF</span>
                          <Input
                            className="h-6 text-[11px] w-12 text-center shrink-0 bg-transparent dark:bg-transparent"
                            readOnly
                            value={editing.entrega_uf || ""}
                            onChange={(e) => set("entrega_uf", e.target.value.toUpperCase())}
                            maxLength={2}
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-muted-foreground shrink-0">
                            Distância
                          </span>
                          <Input
                            className="h-6 text-[11px] w-0 flex-1 min-w-0"
                            value={editing.distancia_km || ""}
                            onChange={(e) => set("distancia_km", e.target.value)}
                          />
                          <span className="text-[9px] text-muted-foreground shrink-0">km</span>
                          <span className="text-[9px] text-muted-foreground shrink-0">Duração</span>
                          <Input
                            className="h-6 text-[11px] w-0 flex-1 min-w-0"
                            value={editing.duracao_horas || ""}
                            onChange={(e) => set("duracao_horas", e.target.value)}
                          />
                          <span className="text-[9px] text-muted-foreground shrink-0">h</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="space-y-1 rounded-xl border px-2 py-1">
                      <p className="text-[11px] font-semibold">Consignatário</p>
                      <div className="grid grid-cols-12 gap-1">
                        <div className="col-span-2">
                          <T
                            editing={editing}
                            set={set}
                            label="CNPJ"
                            k="consig_cnpj"
                            mono
                            doc
                            on14={(d: string) => lookupParte("consig", d)}
                          />
                        </div>
                        <div className="col-span-3">
                          <T editing={editing} set={set} label="Nome" k="consig_nome" />
                        </div>
                        <div className="col-span-2">
                          <T editing={editing} set={set} label="IE" k="consig_ie" digits />
                        </div>
                        <div className="col-span-2">
                          <T editing={editing} set={set} label="CEP" k="consig_cep" mono />
                        </div>
                        <div className="col-span-2">
                          <T editing={editing} set={set} label="Município" k="consig_xmun" />
                        </div>
                        <div className="col-span-1">
                          <T editing={editing} set={set} label="UF" k="consig_uf" />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1 rounded-xl border px-2 py-1">
                      <p className="text-[11px] font-semibold">Redespacho</p>
                      <div className="grid grid-cols-12 gap-1">
                        <div className="col-span-2">
                          <T
                            editing={editing}
                            set={set}
                            label="CNPJ"
                            k="redesp_cnpj"
                            mono
                            doc
                            on14={(d: string) => lookupParte("redesp", d)}
                          />
                        </div>
                        <div className="col-span-3">
                          <T editing={editing} set={set} label="Nome" k="redesp_nome" />
                        </div>
                        <div className="col-span-2">
                          <T editing={editing} set={set} label="IE" k="redesp_ie" digits />
                        </div>
                        <div className="col-span-2">
                          <T editing={editing} set={set} label="CEP" k="redesp_cep" mono />
                        </div>
                        <div className="col-span-2">
                          <T editing={editing} set={set} label="Município" k="redesp_xmun" />
                        </div>
                        <div className="col-span-1">
                          <T editing={editing} set={set} label="UF" k="redesp_uf" />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="border rounded p-2 space-y-1 flex flex-col flex-1">
                    <p className="text-[11px] font-semibold">Fiscal</p>
                    <div className="space-y-1">
                      <div className="flex flex-col gap-1 md:flex-row">
                        <div className="md:flex-1">
                          <Combo
                            label="CST ICMS"
                            value={editing.icms_cst || "00"}
                            onPick={(v) => set("icms_cst", v)}
                            opts={OPTS_CST}
                          />
                        </div>
                        <div className="md:w-[90px] md:shrink-0">
                          <Combo
                            label="CFOP"
                            value={editing.cfop || ""}
                            placeholder=""
                            onPick={(v) => {
                              const o = OPTS_CFOP.find((x) => x.v === v);
                              set("cfop", v);
                              if (o) {
                                const d = CFOPS_CTE.find(
                                  (x) => String(x.codigo).replace(/\D/g, "") === v,
                                );
                                if (d) set("nat_operacao", semNumCfop(d.descricao));
                              }
                            }}
                            opts={OPTS_CFOP}
                          />
                        </div>
                        <div className="md:w-[740px] md:max-w-full md:shrink-0">
                          <Combo
                            label="Natureza da Operação"
                            value={semNumCfop(editing.nat_operacao || "")}
                            placeholder=""
                            onPick={(v) => set("nat_operacao", v)}
                            opts={OPTS_NAT}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 md:flex-row">
                        <div className="md:flex-1">
                          <Combo
                            label="Tipo de carga (ANTT — piso mínimo)"
                            value={editing.tipo_carga_antt || "Carga Geral"}
                            placeholder=""
                            onPick={(v) => set("tipo_carga_antt", v)}
                            opts={OPTS_TIPO_CARGA}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-8 gap-1">
                        <Num editing={editing} set={set} label="Alíq. ICMS %" k="icms_aliq" />
                        <Num editing={editing} set={set} label="Redução base %" k="reducao_base" />
                        <Num
                          editing={editing}
                          set={set}
                          label="Crédito outorgado"
                          k="credito_outorgado"
                        />
                        <Num editing={editing} set={set} label="PIS %" k="pis_aliq" />
                        <Num editing={editing} set={set} label="COFINS %" k="cofins_aliq" />
                        <Num label="IBS %" fixo="0,10" />
                        <Num label="CBS %" fixo="0,90" />
                      </div>
                    </div>
                    <div className="flex-1 flex flex-col min-h-0">
                      <Label className="text-[10px] text-muted-foreground">Observação geral</Label>
                      <Textarea
                        className="text-xs flex-1 resize-none"
                        rows={1}
                        value={editing.obs_gerais ?? ""}
                        onChange={(e) => set("obs_gerais", e.target.value.toUpperCase())}
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="seguro" className="mt-2 space-y-2">
                  <div className="border rounded p-2 space-y-1">
                    <p className="text-[11px] font-semibold">Seguro</p>
                    <div className="grid grid-cols-2 md:grid-cols-12 gap-1">
                      <div className="md:col-span-5">
                        <Label className="text-[10px] text-muted-foreground">Seguradora</Label>
                        <Combobox
                          className="h-7 text-xs"
                          value={editing?.seg_nome || ""}
                          onChange={(v) => {
                            const s = (seguradorasPerc || []).find((x) => x.nome === v);
                            setEditing((e: any) =>
                              e
                                ? {
                                    ...e,
                                    seg_nome: v,
                                    seg_cnpj: s?.cnpj || e.seg_cnpj || "",
                                    seg_apolice: s?.apolice_numero || e.seg_apolice || "",
                                  }
                                : e,
                            );
                          }}
                          options={(seguradorasPerc || []).map((s) => ({
                            value: s.nome,
                            label: s.nome,
                          }))}
                          placeholder="Selecione seguradora"
                          searchPlaceholder="Digite para buscar..."
                          emptyText="Nenhum item encontrado."
                        />
                      </div>
                      <div className="md:col-span-4">
                        <T editing={editing} set={set} label="CNPJ da seguradora" k="seg_cnpj" mono doc />
                      </div>
                      <div className="md:col-span-3">
                        <T editing={editing} set={set} label="Apólice" k="seg_apolice" mono />
                      </div>
                      <Num editing={editing} set={set} label="RCTR-C" k="seg_rctr_c" prefix="R$" />
                      <Num editing={editing} set={set} label="RCF-DC" k="seg_rcf_dc" prefix="R$" />
                      <Num
                        editing={editing}
                        set={set}
                        label="Adicional"
                        k="seg_adicional"
                        prefix="R$"
                      />
                      <Num editing={editing} set={set} label="Total" k="seg_total" prefix="R$" />
                      <div className="flex items-end pb-1">
                        <label className="flex items-center gap-1 text-[11px]">
                          <input
                            type="checkbox"
                            checked={!!editing.seg_repassar}
                            onChange={(e) => set("seg_repassar", e.target.checked)}
                          />{" "}
                          Repassar
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="border rounded p-2 space-y-1">
                    <Label className="text-[10px] text-muted-foreground">Observação</Label>
                    <Textarea
                      className="text-xs resize-none"
                      rows={2}
                      value={editing.obs_gerais ?? ""}
                      onChange={(e) => set("obs_gerais", e.target.value.toUpperCase())}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => fecharVoltandoCte()}>
                Fechar
              </Button>
              <Button onClick={() => salvarPercurso()} disabled={salvar.isPending}>
                <Save className="mr-1 h-3 w-3" /> Salvar
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confExcluir} onOpenChange={(v) => { if (!v) setConfExcluir(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader className="gap-1.5">
            <AlertDialogTitle className="tracking-tight">Excluir percurso</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              {confExcluir && `Excluir o percurso "${confExcluir.nome}"?`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="h-10 rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-acao
              className="h-10 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confExcluir && excluir.mutate(confExcluir.id)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
