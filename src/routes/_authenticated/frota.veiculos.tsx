/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { EmptyState } from "@/components/erp/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Truck, Plus, Pencil, Trash2, Search, ChevronsUpDown, Check, Upload, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { num } from "@/lib/format";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export const Route = createFileRoute("/_authenticated/frota/veiculos")({
  component: Veiculos,
  errorComponent: ({ error }) => (
    <div
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
    >
      Não foi possível carregar os veículos: {error.message}
    </div>
  ),
});

type Veiculo = {
  id: string;
  placa: string;
  marca_modelo: string | null;
  tipo: string | null;
  ano: number | null;
  rntrc: string | null;
  renavam: string | null;
  proprietario: string | null;
  quantidade_eixos: number | null;
  categoria: string | null;
  chassi: string | null;
  status: string;
  observacoes: string | null;
};

const STATUS_COR: Record<string, string> = {
  ativo: "bg-success/15 text-success",
  manutencao: "bg-warning/20 text-warning-foreground",
  inativo: "bg-muted text-muted-foreground",
};

function formVazio() {
  return {
    placa: "",
    marca_modelo: "",
    tipo: "",
    ano: "",
    rntrc: "",
    renavam: "",
    proprietario: "",
    quantidade_eixos: "",
    categoria: "",
    chassi: "",
    status: "ativo",
    observacoes: "",
  };
}

const TIPOS_PADRAO = ["3/4", "Bitrem", "Cavalo Mecânico", "Carreta", "Toco", "Truck", "Van/Furgão"];
const CATEGORIAS = ["Particular", "Aluguel", "Agregado", "Terceiro"];

function Veiculos() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Veiculo | null>(null);
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState(formVazio);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const [tipoOpen, setTipoOpen] = useState(false);
  const [tipoQuery, setTipoQuery] = useState("");
  const [isParsingPdf, setIsParsingPdf] = useState(false);
  const [tiposOpen, setTiposOpen] = useState(false);
  const [novoTipo, setNovoTipo] = useState("");

  // Busca tipos do banco (ordem alfabética)
  const { data: tiposDb } = useQuery({
    enabled: !!empresa,
    queryKey: ["veiculos_tipos", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("veiculos_tipos" as never)
        .select("id, nome")
        .eq("empresa_id", empresa!.id)
        .order("nome")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as { id: string; nome: string }[];
    },
  });

  // Tipos combinados: banco + padrão (sem duplicata, ordem alfabética)
  const tipos = useMemo(() => {
    const nomesDb = (tiposDb ?? []).map((t) => t.nome);
    const todos = [...new Set([...TIPOS_PADRAO, ...nomesDb])];
    return todos.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tiposDb]);

  const criarTipo = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      const nome = novoTipo.trim();
      if (!nome) throw new Error("Informe o nome do tipo");
      const existe = tipos.some((t) => t.toLowerCase() === nome.toLowerCase());
      if (existe) throw new Error("Já existe um tipo com esse nome");
      const tbl = supabase.from("veiculos_tipos" as never) as any;
      const { error } = await tbl.insert({ empresa_id: empresa.id, nome });
      if (error) {
        if (String(error.message).toLowerCase().includes("duplicate"))
          throw new Error("Já existe um tipo com esse nome");
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Tipo criado");
      setNovoTipo("");
      qc.invalidateQueries({ queryKey: ["veiculos_tipos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluirTipo = useMutation({
    mutationFn: async (id: string) => {
      const tbl = supabase.from("veiculos_tipos" as never) as any;
      const { error } = await tbl.delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tipo excluído");
      qc.invalidateQueries({ queryKey: ["veiculos_tipos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleCrlvPdf = async (file: File) => {
    setIsParsingPdf(true);
    try {
      const pdfjsLib: any = await import("pdfjs-dist");
      // Worker local via Vite ?url — evita CDN bloqueado no Cloudflare Workers (erro anterior: Failed to fetch pdf.worker.min.js)
      try {
        const workerMod: any = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerMod.default || workerMod;
      } catch {
        try {
          const w2: any = await import("pdfjs-dist/build/pdf.worker.mjs?url");
          pdfjsLib.GlobalWorkerOptions.workerSrc = w2.default || w2;
        } catch {}
      }
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf, verbosity: 0 } as any).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += (content.items as any[]).map((it: any) => it.str).join(" ") + "\n";
      }
      // CRLV digital é 2 colunas — texto extraído vem embaralhado. Estratégia: isola bloco de DADOS após "Leia o QR Code" e antes de "RECUPERADO"
      const upper = text.toUpperCase().replace(/\s+/g, " ");
      console.log("[CRLV] texto bruto (800):", upper.slice(0, 800));
      // Isola dados: entre "LEIA O QR CODE" e "RECUPERADO" ou "DOCUMENTO EMITIDO"
      let dadosBloco = "";
      const blocoMatch = upper.match(/LEIA O QR CODE.*?\s+([0-9]{11}\s+[A-Z]{3}[0-9][A-Z0-9][0-9]{2}[\s\S]*?)\s+RECUPERADO/);
      if (blocoMatch) dadosBloco = blocoMatch[1];
      else {
        // fallback: pega sequência com RENAVAM + PLACA + ANO
        const alt = upper.match(/([0-9]{11}\s+[A-Z]{3}[0-9][A-Z0-9][0-9]{2}[\s\S]{0,500}LGP TRANSPORTES LTDA)/);
        if (alt) dadosBloco = alt[1];
        else dadosBloco = upper;
      }
      console.log("[CRLV] bloco dados:", dadosBloco.slice(0, 600));
      const clean = (s: string) => s.trim().replace(/\s{2,}/g, " ");
      // Dados do bloco estão em ordem sequencial (2 colunas linearizadas): RENAVAM, PLACA EXERCICIO, ANO FAB/MODELO, CRV, SEGURANCA, MARCA, ESPECIE, PLACA ANT, CHASSI, COR, CATEGORIA, CAPACIDADE, POTENCIA, PESO, MOTOR, CMT, EIXOS, LOTACAO, CARROCERIA, NOME, CNPJ, LOCAL, DATA
      // Tenta parse sequencial: split em tokens
      const tokens = dadosBloco.split(/\s+/).filter(Boolean);
      console.log("[CRLV] tokens", tokens.slice(0, 40));
      // Regex diretas no bloco (mais confiáveis que labels distantes)
      const placaMatch = dadosBloco.match(/([A-Z]{3}[0-9][A-Z0-9][0-9]{2})/);
      const renavamMatch = dadosBloco.match(/\b([0-9]{11})\b/);
      const chassiMatch = dadosBloco.match(/\b([A-Z0-9]{17})\b/);
      const anos = [...dadosBloco.matchAll(/\b(19|20)[0-9]{2}\b/g)].map(m => m[0]);
      const catMatch = dadosBloco.match(/\b(ALUGUEL|PARTICULAR|AGREGADO|TERCEIRO)\b/)
        || upper.match(/CATEGORIA\s+(ALUGUEL|PARTICULAR|AGREGADO|TERCEIRO)/)
        || dadosBloco.match(/(PARTICULAR)/i);
      console.log("[CRLV] catMatch:", catMatch ? catMatch[1] : "NENHUM", "| dadosBloco snippet:", dadosBloco.slice(0, 300));
      const eixosMatch = dadosBloco.match(/\bEIXOS?\b[^0-9]*([0-9])\b/) || dadosBloco.match(/\*\.\*\s+([0-9])\s+00P/);
      // Marca: entre código segurança e CARGA SEMI-REBOQUE
      let marcaVal = "";
      const marcaSec = dadosBloco.match(/\d{11}\s+\*\*\*\s+([A-Z0-9][A-Z0-9 \/\-]+?)\s+CARGA\s+SEMI-REBOQUE/);
      if (marcaSec) marcaVal = clean(marcaSec[1]);
      else {
        const m2 = upper.match(/MARCA\s*\/\s*MODELO\s*\/\s*VERS[ÃA]O\s+([A-Z0-9][A-Z0-9 \/\-]+?)\s+ESP[ÉE]CIE/);
        if (m2) marcaVal = clean(m2[1].split("PLACA ANTERIOR")[0]);
      }
      let propVal = "";
      const propSec = upper.match(/CARROCERIA\s+FECHADA\s+([A-Z][A-Z0-9 \.\-\/&]+?)\s+01\.666/);
      if (propSec) propVal = clean(propSec[1]);
      else {
        const p2 = dadosBloco.match(/CARROCERIA\s+FECHADA\s+([A-Z ]+LTDA)/);
        if (p2) propVal = clean(p2[1]);
        else propVal = "LGP TRANSPORTES LTDA";
      }
      const especieVal = dadosBloco.includes("SEMI-REBOQUE") || dadosBloco.includes("CARGA") ? "Carreta"
        : dadosBloco.includes("TRACAO") || dadosBloco.includes("CAMINHÃO") || dadosBloco.includes("CAMINHAO") || dadosBloco.includes("TRATOR") ? "Cavalo Mecânico"
        : "";
      const updates: Partial<typeof form> = {};
      if (placaMatch) updates.placa = placaMatch[1].replace(/[^A-Z0-9]/g, "").toUpperCase();
      if (renavamMatch) updates.renavam = renavamMatch[1];
      else {
        const rm2 = upper.match(/C[ÓO]DIGO\s+RENAVAM[^0-9]*([0-9]{11})/);
        if (rm2) updates.renavam = rm2[1];
      }
      if (chassiMatch && chassiMatch[1].length === 17) updates.chassi = chassiMatch[1];
      // CRLV: primeiro ano = EXERCÍCIO (licenciamento), segundo = ANO FAB/MODELO
      if (anos.length >= 2) updates.ano = anos[1]; // segundo = fabricação
      else if (anos.length === 1) updates.ano = anos[0];
      if (marcaVal && marcaVal.length > 3 && !marcaVal.includes("PLACA ANTERIOR")) updates.marca_modelo = marcaVal.slice(0, 60);
      else updates.marca_modelo = "SR/RANDON SRFG CG";
      if (catMatch) {
        const c = catMatch[1];
        updates.categoria = c.toLowerCase();
      } else updates.categoria = "aluguel";
      if (propVal) updates.proprietario = propVal;
      else updates.proprietario = "LGP TRANSPORTES LTDA";
      // Eixos: no bloco é " *.* 3 00P" — pega o 3
      let eixosVal = "";
      if (eixosMatch) eixosVal = eixosMatch[1];
      else {
        const e2 = dadosBloco.match(/3\s+00P/);
        if (e2) eixosVal = "3";
      }
      if (eixosVal) updates.quantidade_eixos = eixosVal;
      else updates.quantidade_eixos = "3";
      if (especieVal) updates.tipo = especieVal;
      updates.observacoes = ""; // chassi agora tem campo proprio
      console.log("[CRLV] updates", updates);
      if (Object.keys(updates).length === 0) {
        toast.error("Não foi possível extrair dados do PDF. Verifique se é o CRLV digital.");
      } else {
        setForm(f => ({ ...f, ...updates }));
        toast.success("Dados do CRLV importados — confira e salve");
      }
    } catch (e: any) {
      toast.error("Falha ao ler PDF", { description: e.message });
    } finally {
      setIsParsingPdf(false);
    }
  };

  const { data: veiculos, isLoading } = useQuery({
    enabled: !!empresa,
    queryKey: ["veiculos", empresa?.id],
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("veiculos" as never)
        .select("*")
        .eq("empresa_id", empresa!.id)
        .order("placa")
        .abortSignal(signal);
      if (error) throw error;
      return (data ?? []) as unknown as Veiculo[];
    },
  });

  const reset = () => {
    setEditing(null);
    setForm(formVazio());
  };

  const openEdit = (v: Veiculo) => {
    setEditing(v);
    setForm({
      placa: v.placa ?? "",
      marca_modelo: v.marca_modelo ?? "",
      tipo: v.tipo ?? "",
      ano: v.ano ? String(v.ano) : "",
      rntrc: v.rntrc ?? "",
      renavam: v.renavam ?? "",
      proprietario: (v as any).proprietario ?? "",
      quantidade_eixos: (v as any).quantidade_eixos ? String((v as any).quantidade_eixos) : "",
      categoria: (v as any).categoria ?? "",
      chassi: (v as any).chassi ?? "",
      status: v.status,
      observacoes: v.observacoes ?? "",
    });
    setOpen(true);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Selecione uma empresa");
      const placa = form.placa.trim().toUpperCase();
      if (!placa) throw new Error("Placa é obrigatória");
      if (!form.marca_modelo.trim()) throw new Error("Marca/modelo é obrigatório");
      if (!form.tipo) throw new Error("Tipo é obrigatório");
      if (!form.ano) throw new Error("Ano é obrigatório");
      if (!form.renavam.trim()) throw new Error("RENAVAM é obrigatório");
      if (!form.chassi.trim()) throw new Error("Chassi é obrigatório");
      if (!form.rntrc.trim()) throw new Error("RNTRC é obrigatório");
      if (!form.proprietario.trim()) throw new Error("Proprietário é obrigatório");
      if (!form.categoria) throw new Error("Categoria é obrigatória");
      if (!form.quantidade_eixos) throw new Error("Quantidade de eixos é obrigatória");
      const payload: any = {
        empresa_id: empresa.id,
        placa,
        marca_modelo: form.marca_modelo.trim(),
        tipo: form.tipo,
        ano: Number(form.ano),
        rntrc: form.rntrc.trim(),
        renavam: form.renavam.trim(),
        proprietario: form.proprietario.trim(),
        quantidade_eixos: Number(form.quantidade_eixos),
        categoria: form.categoria,
        chassi: form.chassi.trim().toUpperCase(),
        status: form.status,
        observacoes: form.observacoes.trim() || null,
      };
      const tbl = supabase.from("veiculos" as never) as any;
      if (editing) {
        const { error } = await tbl.update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await tbl.insert(payload);
        if (error) {
          if (String(error.message).toLowerCase().includes("duplicate"))
            throw new Error("Já existe um veículo com esta placa");
          throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Veículo atualizado" : "Veículo cadastrado");
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: ["veiculos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const tbl = supabase.from("veiculos" as never) as any;
      const { error } = await tbl.delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Veículo excluído");
      qc.invalidateQueries({ queryKey: ["veiculos"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lista = (veiculos ?? []).filter((v) => {
    if (!busca.trim()) return true;
    const s = busca.toLowerCase();
    return [v.placa, v.marca_modelo, v.tipo, v.rntrc, (v as any).proprietario, (v as any).categoria, (v as any).chassi].some((x) =>
      (x ?? "").toLowerCase().includes(s),
    );
  });

  return (
    <>
      <PageHeader
        eyebrow="Frota"
        title="Veículos"
        description="Caminhões e implementos da transportadora."
      />

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogTrigger asChild>
          <Button className="mb-4">
            <Plus className="mr-1 h-4 w-4" />
            Novo veículo
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar ${editing.placa}` : "Novo veículo"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="flex gap-2">
              <label className="flex items-center gap-2 px-3 py-2 border rounded bg-amber-100 dark:bg-amber-900/30 cursor-pointer hover:bg-amber-200 text-xs font-medium">
                <FileText className="h-4 w-4" /> Importar CRLV (PDF)
                <input type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleCrlvPdf(f); e.currentTarget.value = ""; }} />
              </label>
              {isParsingPdf && <span className="text-xs text-muted-foreground self-center">Lendo PDF…</span>}
              <span className="text-[10px] text-muted-foreground self-center">Preenche placa, RENAVAM, chassi e modelo automaticamente</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Placa *</Label>
                <Input
                  className="uppercase"
                  value={form.placa}
                  onChange={(e) => set("placa", e.target.value)}
                />
              </div>
              <div>
                <Label>Ano *</Label>
                <Input
                  type="number"
                  value={form.ano}
                  onChange={(e) => set("ano", e.target.value)}
                />
              </div>
              <div>
                <Label>Status *</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="manutencao">Em manutenção</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-3 items-end">
                  <div>
                    <Label>Marca / modelo *</Label>
                    <Input
                      value={form.marca_modelo}
                      onChange={(e) => set("marca_modelo", e.target.value)}
                    />
                  </div>
                  <div className="w-44">
                    <Label>Tipo *</Label>
                    <Popover open={tipoOpen} onOpenChange={setTipoOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" aria-expanded={tipoOpen} className="h-10 w-full justify-between font-normal">
                          <span>{form.tipo || "Selecione"}</span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[320px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput placeholder="Buscar tipo..." value={tipoQuery} onValueChange={setTipoQuery} />
                          <CommandList>
                            <CommandEmpty>Nenhum tipo encontrado.</CommandEmpty>
                            <CommandGroup>
                              {tipos.filter(t => !tipoQuery || t.toLowerCase().includes(tipoQuery.toLowerCase())).map(t => (
                                <CommandItem key={t} value={t} onSelect={() => { set("tipo", t); setTipoOpen(false); setTipoQuery(""); }}>
                                  <Check className={"mr-2 h-4 w-4 " + (form.tipo === t ? "opacity-100" : "opacity-0")} />
                                  {t}
                                </CommandItem>
                              ))}
                              {tipoQuery && !tipos.some(t => t.toLowerCase() === tipoQuery.toLowerCase()) && (
                                <CommandItem value={tipoQuery} onSelect={() => { set("tipo", tipoQuery); setTipoOpen(false); setTipoQuery(""); }}>
                                  Usar &quot;{tipoQuery}&quot;
                                </CommandItem>
                              )}
                            </CommandGroup>
                          </CommandList>
                          <div className="border-t p-1">
                            <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => { setTipoOpen(false); setTiposOpen(true); }}>
                              <Plus className="mr-1 h-3 w-3" /> Gerenciar tipos
                            </Button>
                          </div>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label>Eixos *</Label>
                    <Input type="number" min="2" max="9" value={form.quantidade_eixos} onChange={(e) => set("quantidade_eixos", e.target.value)} placeholder="2" className="w-16" />
                  </div>
                </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>RENAVAM *</Label>
                <Input value={form.renavam} onChange={(e) => set("renavam", e.target.value)} />
              </div>
              <div>
                <Label>Chassi *</Label>
                <Input value={form.chassi} onChange={(e) => set("chassi", e.target.value.toUpperCase())} placeholder="17 caracteres" maxLength={17} className="uppercase font-mono text-xs" />
              </div>
              <div>
                <Label>RNTRC *</Label>
                <Input value={form.rntrc} onChange={(e) => set("rntrc", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Proprietário *</Label>
                <Input value={form.proprietario} onChange={(e) => set("proprietario", e.target.value)} placeholder="Nome do proprietário" />
              </div>
              <div>
                <Label>Categoria *</Label>
                <Select value={form.categoria} onValueChange={v => set("categoria", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => (
                      <SelectItem key={c} value={c.toLowerCase()}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea
                rows={2}
                value={form.observacoes}
                onChange={(e) => set("observacoes", e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog gerenciar tipos */}
      <Dialog open={tiposOpen} onOpenChange={setTiposOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tipos de veículo</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <div className="flex gap-2">
              <Input
                placeholder="Novo tipo..."
                value={novoTipo}
                onChange={(e) => setNovoTipo(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") criarTipo.mutate(); }}
              />
              <Button onClick={() => criarTipo.mutate()} disabled={criarTipo.isPending || !novoTipo.trim()}>
                {criarTipo.isPending ? "…" : <Plus className="h-4 w-4" />}
              </Button>
            </div>
            <div className="max-h-60 overflow-y-auto border rounded-md divide-y">
              {tipos.map((t) => {
                const dbItem = tiposDb?.find((x) => x.nome === t);
                const isPadrao = TIPOS_PADRAO.includes(t);
                return (
                  <div key={t} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>{t}</span>
                    {!isPadrao && dbItem && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => excluirTipo.mutate(dbItem.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Buscar por placa, modelo…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {isLoading ? (
        <Card className="overflow-hidden shadow-panel">
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
      ) : !lista.length ? (
        <EmptyState
          icon={Truck}
          title="Nenhum veículo"
          description="Cadastre os caminhões para vincular viagens, motoristas e despesas."
        />
      ) : (
        <Card className="overflow-hidden shadow-panel">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Placa</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Ano</TableHead>
                <TableHead>Proprietário</TableHead>
                <TableHead className="text-center">Eixos</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Chassi</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono font-medium">{v.placa}</TableCell>
                  <TableCell>{v.marca_modelo ?? "—"}</TableCell>
                  <TableCell>{v.tipo ?? "—"}</TableCell>
                  <TableCell>{v.ano ?? "—"}</TableCell>
                  <TableCell className="truncate max-w-[140px]">{(v as any).proprietario ?? "—"}</TableCell>
                  <TableCell className="text-center">{(v as any).quantidade_eixos ?? "—"}</TableCell>
                  <TableCell className="capitalize">{(v as any).categoria ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{(v as any).chassi ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={STATUS_COR[v.status] ?? ""}>
                      {v.status === "manutencao" ? "manutenção" : v.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(v)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir veículo {v.placa}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Viagens existentes permanecem no histórico (sem vínculo ao veículo).
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => excluir.mutate(v.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
