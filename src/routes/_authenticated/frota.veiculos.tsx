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
import { useState } from "react";
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
    status: "ativo",
    observacoes: "",
  };
}

const TIPOS = ["Caminhão 3/4", "Toco", "Truck", "Carreta", "Bitrem", "Van/Furgão"];
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

  const handleCrlvPdf = async (file: File) => {
    setIsParsingPdf(true);
    try {
      const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
      // @ts-ignore
      const pdfjsVersion = await import("pdfjs-dist/package.json");
      GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${(pdfjsVersion as any).default?.version || "4.4.168"}/pdf.worker.min.js`;
      const buf = await file.arrayBuffer();
      const pdf = await getDocument({ data: buf }).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += (content.items as any[]).map((it: any) => it.str).join(" ") + "\n";
      }
      const upper = text.toUpperCase();
      const placaMatch = upper.match(/PLACA[:\s]*([A-Z]{3}[0-9][A-Z0-9][0-9]{2})/) || upper.match(/([A-Z]{3}[ -]?[0-9][A-Z0-9][0-9]{2})/);
      const renavamMatch = upper.match(/RENAVAM[:\s]*([0-9]{9,11})/) || upper.match(/([0-9]{11})/);
      const chassiMatch = upper.match(/CHASSI[:\s]*([A-Z0-9]{17})/);
      const anoMatch = upper.match(/ANO(?:\s*FABRICA[ÇC]AO)?[:\s]*([0-9]{4})/);
      const marcaMatch = upper.match(/MARCA\/MODELO[:\s]*([A-Z0-9 \/\-]+)/);
      const catMatch = upper.match(/CATEGORIA[:\s]*([A-Z]+)/);
      const propMatch = upper.match(/NOME\s+DO\s+PROPRIET[ÁA]RIO[:\s]*([A-Z ]+)/);
      const eixosMatch = upper.match(/EIXOS[:\s]*([0-9])/);
      const updates: Partial<typeof form> = {};
      if (placaMatch) updates.placa = placaMatch[1].replace(/[^A-Z0-9]/g, "").toUpperCase();
      if (renavamMatch) updates.renavam = renavamMatch[1].replace(/\D/g, "");
      if (chassiMatch) updates.observacoes = `Chassi: ${chassiMatch[1]}`;
      if (anoMatch) updates.ano = anoMatch[1];
      if (marcaMatch) updates.marca_modelo = marcaMatch[1].trim().slice(0, 60);
      if (catMatch) {
        const cat = catMatch[1].trim().toLowerCase();
        if (["ALUGUEL", "PARTICULAR", "AGREGADO", "TERCEIRO"].some(c => cat.includes(c.toLowerCase()))) {
          updates.categoria = cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
          if (updates.categoria.toLowerCase() === "aluguel") updates.categoria = "Aluguel";
          if (updates.categoria.toLowerCase() === "particular") updates.categoria = "Particular";
        }
      }
      if (propMatch) updates.proprietario = propMatch[1].trim();
      if (eixosMatch) updates.quantidade_eixos = eixosMatch[1];
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
      const payload: any = {
        empresa_id: empresa.id,
        placa,
        marca_modelo: form.marca_modelo.trim() || null,
        tipo: form.tipo || null,
        ano: form.ano ? Number(form.ano) : null,
        rntrc: form.rntrc.trim() || null,
        renavam: form.renavam.trim() || null,
        proprietario: form.proprietario.trim() || null,
        quantidade_eixos: form.quantidade_eixos ? Number(form.quantidade_eixos) : null,
        categoria: form.categoria || null,
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
    return [v.placa, v.marca_modelo, v.tipo, v.rntrc, (v as any).proprietario, (v as any).categoria].some((x) =>
      (x ?? "").toLowerCase().includes(s),
    );
  });

  return (
    <>
      <PageHeader
        eyebrow="Frota"
        title="Veículos"
        description="Caminhões e implementos da transportadora."
        actions={
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) reset();
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-1 h-4 w-4" />
                Novo veículo
              </Button>
            </DialogTrigger>
            <DialogContent>
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
                    <Label>Ano</Label>
                    <Input
                      type="number"
                      value={form.ano}
                      onChange={(e) => set("ano", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
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
                <div>
                  <Label>Marca / modelo</Label>
                  <Input
                    value={form.marca_modelo}
                    onChange={(e) => set("marca_modelo", e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Tipo</Label>
                    <Popover open={tipoOpen} onOpenChange={setTipoOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" aria-expanded={tipoOpen} className="h-10 w-full justify-between font-normal">
                          <span className="truncate">{form.tipo || "Selecione tipo"}</span>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[320px] p-0" align="start">
                        <Command shouldFilter={false}>
                          <CommandInput placeholder="Buscar tipo..." value={tipoQuery} onValueChange={setTipoQuery} />
                          <CommandList>
                            <CommandEmpty>Nenhum tipo encontrado.</CommandEmpty>
                            <CommandGroup>
                              {TIPOS.filter(t => !tipoQuery || t.toLowerCase().includes(tipoQuery.toLowerCase())).map(t => (
                                <CommandItem key={t} value={t} onSelect={() => { set("tipo", t); setTipoOpen(false); setTipoQuery(""); }}>
                                  <Check className={"mr-2 h-4 w-4 " + (form.tipo === t ? "opacity-100" : "opacity-0")} />
                                  {t}
                                </CommandItem>
                              ))}
                              {tipoQuery && !TIPOS.some(t => t.toLowerCase() === tipoQuery.toLowerCase()) && (
                                <CommandItem value={tipoQuery} onSelect={() => { set("tipo", tipoQuery); setTipoOpen(false); setTipoQuery(""); }}>
                                  Usar &quot;{tipoQuery}&quot;
                                </CommandItem>
                              )}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label>RNTRC</Label>
                    <Input value={form.rntrc} onChange={(e) => set("rntrc", e.target.value)} />
                  </div>
                  <div>
                    <Label>RENAVAM</Label>
                    <Input value={form.renavam} onChange={(e) => set("renavam", e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Proprietário</Label>
                    <Input value={form.proprietario} onChange={(e) => set("proprietario", e.target.value)} placeholder="Nome do proprietário" />
                  </div>
                  <div>
                    <Label>Qtd. Eixos</Label>
                    <Input type="number" min="2" max="9" value={form.quantidade_eixos} onChange={(e) => set("quantidade_eixos", e.target.value)} placeholder="Ex: 2" />
                  </div>
                  <div>
                    <Label>Categoria</Label>
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
        }
      />

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
