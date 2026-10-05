import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Combobox } from "@/components/erp/combobox";
import { DateInput } from "@/components/erp/date-input";
import { MoneyInput } from "@/components/erp/money-input";
import { Archive, Plus, XCircle } from "lucide-react";

export interface CondicaoParcela {
  numero: string;
  dataVencimento: string;
  valor: number;
  forma_pagamento: string;
  conta_bancaria_id: string;
}

function isoPlusDays(iso: string, days: number): string {
  const base = iso ? Date.parse(`${iso}T00:00:00`) : NaN;
  const t = Number.isNaN(base) ? Date.now() : base;
  return new Date(t + days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
}

function brl(v: number): string {
  return (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(v: number, total: number): string {
  if (!total) return "—";
  return ((v / total) * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Condição de pagamento + parcelas no estilo Conta Azul:
// topo (parcelamento, 1º vencimento, intervalo, forma, conta) gera as linhas;
// cada linha é editável (vencimento, valor, % automático, forma, conta).
export function CondicaoPagamento({
  total,
  parcelas,
  onChange,
  contas,
  formas,
  emptyHint,
  travarRegen,
}: {
  total: number;
  parcelas: CondicaoParcela[];
  onChange: (p: CondicaoParcela[]) => void;
  contas: Array<{ id: string; nome: string }>;
  formas: readonly string[] | string[];
  emptyHint?: string;
  // Com dados vindos da nota (XML): o topo carimba forma/conta nas linhas,
  // mas NUNCA recalcula datas e valores.
  travarRegen?: boolean;
}) {
  const [nx, setNx] = useState(() => String(Math.min(12, Math.max(1, parcelas.length || 1))));
  const [primeiro, setPrimeiro] = useState(
    parcelas[0]?.dataVencimento || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  );
  const [intervalo, setIntervalo] = useState(() => {
    if (parcelas.length > 1) {
      const a = Date.parse(`${parcelas[0]?.dataVencimento || ""}T00:00:00`);
      const b = Date.parse(`${parcelas[1]?.dataVencimento || ""}T00:00:00`);
      if (!Number.isNaN(a) && !Number.isNaN(b)) return String(Math.max(0, Math.round((b - a) / 86400000)));
    }
    return "30";
  });
  const [formaTop, setFormaTop] = useState(() => {
    const fs = [...new Set(parcelas.map((p) => p.forma_pagamento).filter(Boolean))];
    return fs.length === 1 ? fs[0] : "Boleto";
  });
  const [contaTop, setContaTop] = useState(() => {
    const cs = [...new Set(parcelas.map((p) => p.conta_bancaria_id).filter(Boolean))];
    return cs.length === 1 ? cs[0] : "__none__";
  });

  // Parcelamento acompanha a quantidade real de linhas (XML, adicionar/remover)
  useEffect(() => {
    setNx(String(Math.min(12, Math.max(1, parcelas.length || 1))));
  }, [parcelas.length]);

  const gerar = (nStr: string, prim: string, intervStr: string, forma: string, conta: string) => {
    const n = Math.min(48, Math.max(1, parseInt(nStr, 10) || 1));
    const interv = Math.max(0, parseInt(intervStr, 10) || 0);
    const contaId = conta === "__none__" ? "" : conta;
    const base = Math.floor((total / n) * 100) / 100;
    const rows: CondicaoParcela[] = [];
    for (let k = 0; k < n; k++) {
      const resto = k === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base;
      rows.push({
        numero: String(k + 1).padStart(3, "0"),
        dataVencimento: isoPlusDays(prim, k * interv),
        valor: resto,
        forma_pagamento: forma,
        conta_bancaria_id: contaId,
      });
    }
    onChange(rows);
  };

  const setRow = (i: number, patch: Partial<CondicaoParcela>) => {
    const novas = [...parcelas];
    novas[i] = { ...novas[i], ...patch };
    onChange(novas);
  };

  // Só carimba forma/conta nas linhas, sem tocar em datas e valores
  const carimbar = (forma: string, conta: string) => {
    const contaId = conta === "__none__" ? "" : conta;
    onChange(parcelas.map((p) => ({ ...p, forma_pagamento: forma, conta_bancaria_id: contaId })));
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border">
        <div className="border-b border-primary/20 bg-primary/8 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary/80">Condição de pagamento</div>
        <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-5">
          <div>
            <span className="text-xs text-muted-foreground">Parcelamento</span>
            <Select
              value={nx}
              disabled={travarRegen}
              onValueChange={(v) => { setNx(v); gerar(v, primeiro, intervalo, formaTop, contaTop); }}
            >
              <SelectTrigger className="h-8 text-xs w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, k) => (
                  <SelectItem key={k + 1} value={String(k + 1)}>{k + 1}x</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <span className="text-xs text-muted-foreground">1º Vencimento</span>
            <DateInput
              className="h-8 text-xs w-full"
              value={primeiro}
              disabled={travarRegen}
              onChange={(v) => { setPrimeiro(v); gerar(nx, v, intervalo, formaTop, contaTop); }}
            />
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Intervalo (dias)</span>
            <MoneyInput
              prefix=""
              decimals={0}
              className="h-8 text-xs w-full"
              value={intervalo}
              disabled={travarRegen}
              onChange={(v) => { setIntervalo(v); gerar(nx, primeiro, v, formaTop, contaTop); }}
            />
          </div>
          <div>
            <span className="text-xs text-muted-foreground">Forma de pagamento</span>
            <Select
              value={formaTop}
              onValueChange={(v) => { setFormaTop(v); if (travarRegen) carimbar(v, contaTop); else gerar(nx, primeiro, intervalo, v, contaTop); }}
            >
              <SelectTrigger className="h-8 text-xs w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formas.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 md:col-span-1">
            <span className="text-xs text-muted-foreground">Conta de pagamento</span>
            <Combobox
              value={contaTop}
              onChange={(v) => { setContaTop(v); if (travarRegen) carimbar(formaTop, v); else gerar(nx, primeiro, intervalo, formaTop, v); }}
              options={[
                { value: "__none__", label: "Sem conta" },
                ...contas.map((c) => ({ value: c.id, label: c.nome })),
              ]}
              placeholder="Conta de pagamento"
              searchPlaceholder="Digite para buscar..."
              emptyText="Nenhuma conta encontrada."
              className="h-8 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Parcelas só aparecem no parcelamento (2+); com 1, a condição já resolve */}
      {parcelas.length !== 1 && (
      <div className="overflow-hidden rounded-lg border">
        <div className="flex items-center justify-between gap-2 border-b border-primary/20 bg-primary/8 px-3 py-1.5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-primary/80">
            <Archive className="h-3.5 w-3.5" />
            Parcelas
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => {
              const ult = parcelas[parcelas.length - 1];
              onChange([...parcelas, {
                numero: String(parcelas.length + 1).padStart(3, "0"),
                dataVencimento: ult ? isoPlusDays(ult.dataVencimento, 30) : primeiro,
                valor: 0,
                forma_pagamento: formaTop,
                conta_bancaria_id: contaTop === "__none__" ? "" : contaTop,
              }]);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar Parcela
          </Button>
        </div>
        <div className="p-3">
        {parcelas.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {emptyHint || "Altere a condição acima para gerar as parcelas."}
          </p>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <div className="hidden md:grid grid-cols-[36px_150px_130px_70px_1fr_36px] gap-2 border-b bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <span>Nº</span>
              <span>Vencimento</span>
              <span>Valor (R$)</span>
              <span>%</span>
              <span>Forma de pagamento</span>
              <span />
            </div>
            <div className="divide-y">
              {parcelas.map((p, i) => (
                <div key={i} className="grid grid-cols-2 md:grid-cols-[36px_150px_130px_70px_1fr_36px] gap-2 px-3 py-2 items-center">
                  <span className="text-xs font-medium text-muted-foreground">{i + 1}</span>
                  <DateInput
                    className="h-8 text-xs w-full"
                    value={p.dataVencimento}
                    onChange={(v) => setRow(i, { dataVencimento: v })}
                  />
                  <MoneyInput
                    value={String(p.valor ?? 0)}
                    onChange={(v) => setRow(i, { valor: parseFloat(v) || 0 })}
                    className="h-8 text-xs text-right w-full"
                    placeholder="0,00"
                  />
                  <Input className="h-8 text-xs text-right" value={pct(p.valor, total)} readOnly tabIndex={-1} />
                  <Select
                    value={p.forma_pagamento || "Boleto"}
                    onValueChange={(v) => setRow(i, { forma_pagamento: v })}
                  >
                    <SelectTrigger className="h-8 text-xs w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {formas.map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="col-span-2 md:col-span-1 flex justify-end">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 shrink-0"
                            onClick={() => onChange(parcelas.filter((_, idx) => idx !== i))}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Remover parcela</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end border-t bg-muted/30 px-3 py-1.5">
              <span className="text-xs text-muted-foreground">
                Total parcelas: <span className="font-semibold text-foreground">{brl(parcelas.reduce((a, p) => a + p.valor, 0))}</span>
                {Math.abs(parcelas.reduce((a, p) => a + p.valor, 0) - total) > 0.009 && (
                  <span className="text-destructive ml-2">(diferente do total: {brl(total)})</span>
                )}
              </span>
            </div>
          </div>
        )}
        </div>
      </div>
      )}
    </div>
  );
}
