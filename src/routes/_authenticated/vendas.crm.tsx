import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/erp/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MoneyInput } from "@/components/erp/money-input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEmpresaAtual } from "@/hooks/use-empresa";
import { toast } from "sonner";
import { brl, dateBR } from "@/lib/format";
import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor,
  useDroppable, useSensor, useSensors,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";

export const Route = createFileRoute("/_authenticated/vendas/crm")({
  component: CRM,
  errorComponent: ({ error }) => (
    <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
      Erro ao carregar CRM: {error.message}
    </div>
  ),
});

type Etapa = {
  id: string; nome: string; ordem: number; cor: string | null;
  ganho: boolean | null; perdido: boolean | null;
};
type Oport = {
  id: string; titulo: string; descricao: string | null; valor: number;
  probabilidade: number | null; data_prevista: string | null;
  etapa_id: string | null; contato_id: string | null; status: string;
  contatos?: { nome: string } | null;
};

function CRM() {
  const { data: empresa } = useEmpresaAtual();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Oport | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("0");
  const [prob, setProb] = useState("50");
  const [dataPrev, setDataPrev] = useState("");
  const [contato, setContato] = useState<string>("none");
  const [etapa, setEtapa] = useState<string>("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const { data: etapas = [], isLoading: loadEt } = useQuery({
    enabled: !!empresa,
    queryKey: ["crm_etapas", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("crm_etapas" as never)
        .select("*").eq("empresa_id", empresa!.id).order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as Etapa[];
    },
  });

  const { data: oports = [], isLoading: loadOp } = useQuery({
    enabled: !!empresa,
    queryKey: ["crm_oportunidades", empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("crm_oportunidades" as never)
        .select("*, contatos:contato_id(nome)")
        .eq("empresa_id", empresa!.id).order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as Oport[];
    },
  });

  const { data: contatos = [] } = useQuery({
    enabled: !!empresa,
    queryKey: ["contatos-todos", empresa?.id],
    queryFn: async () => {
      const { data } = await supabase.from("contatos").select("id,nome")
        .eq("empresa_id", empresa!.id).order("nome");
      return data ?? [];
    },
  });

  const porEtapa = useMemo(() => {
    const m = new Map<string, Oport[]>();
    for (const e of etapas) m.set(e.id, []);
    for (const o of oports) if (o.etapa_id && m.has(o.etapa_id)) m.get(o.etapa_id)!.push(o);
    return m;
  }, [etapas, oports]);

  const totalPorEtapa = (id: string) =>
    (porEtapa.get(id) ?? []).reduce((s, o) => s + Number(o.valor || 0), 0);

  const reset = () => {
    setEditing(null); setTitulo(""); setDescricao(""); setValor("0");
    setProb("50"); setDataPrev(""); setContato("none"); setEtapa(etapas[0]?.id ?? "");
  };

  const openNew = (etapaId?: string) => {
    reset(); if (etapaId) setEtapa(etapaId); else setEtapa(etapas[0]?.id ?? "");
    setOpen(true);
  };
  const openEdit = (o: Oport) => {
    setEditing(o); setTitulo(o.titulo); setDescricao(o.descricao ?? "");
    setValor(String(o.valor ?? 0)); setProb(String(o.probabilidade ?? 50));
    setDataPrev(o.data_prevista ?? ""); setContato(o.contato_id ?? "none");
    setEtapa(o.etapa_id ?? etapas[0]?.id ?? ""); setOpen(true);
  };

  const salvar = useMutation({
    mutationFn: async () => {
      if (!empresa) throw new Error("Sem empresa");
      if (!titulo.trim()) throw new Error("Informe o título");
      if (!etapa) throw new Error("Selecione uma etapa");
      const payload = {
        empresa_id: empresa.id,
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        valor: Number(valor) || 0,
        probabilidade: Number(prob) || 0,
        data_prevista: dataPrev || null,
        contato_id: contato === "none" ? null : contato,
        etapa_id: etapa,
      };
      if (editing) {
        const { error } = await supabase.from("crm_oportunidades" as never)
          .update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("crm_oportunidades" as never).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Oportunidade atualizada" : "Oportunidade criada");
      qc.invalidateQueries({ queryKey: ["crm_oportunidades", empresa?.id] });
      setOpen(false); reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const excluir = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("crm_oportunidades" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Excluída");
      qc.invalidateQueries({ queryKey: ["crm_oportunidades", empresa?.id] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mover = useMutation({
    mutationFn: async ({ id, etapa_id }: { id: string; etapa_id: string }) => {
      const et = etapas.find((e) => e.id === etapa_id);
      const status = et?.ganho ? "ganha" : et?.perdido ? "perdida" : "aberta";
      const { error } = await supabase.from("crm_oportunidades" as never)
        .update({ etapa_id, status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["crm_oportunidades", empresa?.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const onDragStart = (ev: DragStartEvent) => setActiveId(String(ev.active.id));
  const onDragEnd = (ev: DragEndEvent) => {
    setActiveId(null);
    const id = String(ev.active.id);
    const overId = ev.over?.id ? String(ev.over.id) : null;
    if (!overId) return;
    const o = oports.find((x) => x.id === id);
    if (!o || o.etapa_id === overId) return;
    mover.mutate({ id, etapa_id: overId });
  };

  const activeOp = activeId ? oports.find((o) => o.id === activeId) : null;

  return (
    <>
      <PageHeader
        eyebrow="Vendas & CRM"
        title="Funil de vendas"
        description="Arraste as oportunidades entre as etapas do funil."
        actions={
          <Button onClick={() => openNew()} disabled={etapas.length === 0}>
            <Plus className="mr-2 h-4 w-4" /> Nova oportunidade
          </Button>
        }
      />

      {loadEt || loadOp ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-96 w-full" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {etapas.map((e) => (
              <Column
                key={e.id}
                etapa={e}
                oports={porEtapa.get(e.id) ?? []}
                total={totalPorEtapa(e.id)}
                onAdd={() => openNew(e.id)}
                onEdit={openEdit}
              />
            ))}
          </div>
          <DragOverlay>
            {activeOp && <OportCard o={activeOp} dragging />}
          </DragOverlay>
        </DndContext>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar oportunidade" : "Nova oportunidade"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Título *</Label>
              <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor</Label>
                <MoneyInput value={valor} onChange={setValor} />
              </div>
              <div>
                <Label>Probabilidade (%)</Label>
                <Input type="number" min={0} max={100} value={prob}
                  onChange={(e) => setProb(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Previsão</Label>
                <Input type="date" value={dataPrev} onChange={(e) => setDataPrev(e.target.value)} />
              </div>
              <div>
                <Label>Etapa</Label>
                <Select value={etapa} onValueChange={setEtapa}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {etapas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Contato</Label>
              <Select value={contato} onValueChange={setContato}>
                <SelectTrigger><SelectValue placeholder="Sem contato" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— sem contato —</SelectItem>
                  {contatos.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editing && (
              <Button variant="destructive" onClick={() => excluir.mutate(editing.id)}>
                <Trash2 className="mr-2 h-4 w-4" /> Excluir
              </Button>
            )}
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => salvar.mutate()} disabled={salvar.isPending}>
              {salvar.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Column({
  etapa, oports, total, onAdd, onEdit,
}: {
  etapa: Etapa; oports: Oport[]; total: number;
  onAdd: () => void; onEdit: (o: Oport) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id });
  const cor = etapa.cor ?? "#64748b";
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between rounded-t-lg border border-b-0 border-border/60 bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: cor }} />
          <span className="text-sm font-semibold">{etapa.nome}</span>
          <span className="text-xs text-muted-foreground">({oports.length})</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-[24rem] flex-1 flex-col gap-2 rounded-b-lg border border-border/60 bg-background/40 p-2 transition-colors ${isOver ? "bg-primary/5 ring-2 ring-primary/40" : ""}`}
      >
        {oports.map((o) => (
          <DraggableCard key={o.id} o={o} onClick={() => onEdit(o)} />
        ))}
        {oports.length === 0 && (
          <p className="mt-6 text-center text-xs text-muted-foreground">Sem oportunidades</p>
        )}
      </div>
      <div className="mt-2 px-1 text-xs text-muted-foreground">
        Total: <span className="font-medium text-foreground">{brl(total)}</span>
      </div>
    </div>
  );
}

function DraggableCard({ o, onClick }: { o: Oport; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: o.id });
  return (
    <div
      ref={setNodeRef}
      className={isDragging ? "opacity-40" : ""}
      onClick={onClick}
    >
      <OportCard o={o} handleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function OportCard({
  o, dragging, handleProps,
}: { o: Oport; dragging?: boolean; handleProps?: React.HTMLAttributes<HTMLButtonElement> }) {
  return (
    <Card className={`cursor-pointer p-3 shadow-sm hover:shadow transition ${dragging ? "ring-2 ring-primary" : ""}`}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...handleProps}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Arrastar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{o.titulo}</div>
          {o.contatos?.nome && (
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{o.contatos.nome}</div>
          )}
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-foreground">{brl(Number(o.valor || 0))}</span>
            {o.data_prevista && (
              <span className="text-muted-foreground">{dateBR(o.data_prevista)}</span>
            )}
          </div>
          {typeof o.probabilidade === "number" && (
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, o.probabilidade))}%` }} />
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
