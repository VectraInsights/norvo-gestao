import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear,
  addDays, subDays, addMonths, addYears, format, parse, isValid,
} from "date-fns";
import { ptBR } from "date-fns/locale";

const nomeMesAno = (d: Date) => {
  const s = format(d, "MMMM/yyyy", { locale: ptBR });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export type Periodo = { from: Date | null; to: Date | null; label: string };

export const PERIODO_TODOS: Periodo = { from: null, to: null, label: "Todo o período" };

export function periodoProx7(): Periodo {
  const hoje = new Date();
  return { from: startOfDay(hoje), to: endOfDay(addDays(hoje, 6)), label: "Próximos 7 dias" };
}

type PresetKey =
  | "hoje" | "prox7" | "prox30" | "ult7" | "ult30"
  | "mesatual" | "anoatual" | "todos" | "custom";

const PRESETS: { k: PresetKey; label: string; range: () => Periodo }[] = [
  { k: "hoje", label: "Hoje", range: () => { const d = new Date(); return { from: startOfDay(d), to: endOfDay(d), label: "Hoje" }; } },
  { k: "prox7", label: "Próximos 7 dias", range: () => periodoProx7() },
  { k: "prox30", label: "Próximos 30 dias", range: () => ({ from: startOfDay(new Date()), to: endOfDay(addDays(new Date(), 30)), label: "Próximos 30 dias" }) },
  { k: "ult7", label: "Últimos 7 dias", range: () => ({ from: startOfDay(subDays(new Date(), 7)), to: endOfDay(new Date()), label: "Últimos 7 dias" }) },
  { k: "ult30", label: "Últimos 30 dias", range: () => ({ from: startOfDay(subDays(new Date(), 30)), to: endOfDay(new Date()), label: "Últimos 30 dias" }) },
  { k: "mesatual", label: "Mês atual", range: () => { const d = new Date(); const f = startOfMonth(d); return { from: f, to: endOfMonth(d), label: nomeMesAno(f) }; } },
  { k: "anoatual", label: "Ano atual", range: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()), label: "Ano atual" }) },
  { k: "todos", label: "Todo o período", range: () => PERIODO_TODOS },
];

function parseBR(s: string): Date | null {
  const d = parse(s, "dd/MM/yyyy", new Date());
  return isValid(d) ? d : null;
}

const NAVEGAVEIS: PresetKey[] = ["hoje", "prox7", "prox30", "ult7", "ult30", "mesatual", "anoatual"];

function shiftPeriodo(p: Periodo, preset: PresetKey, dir: 1 | -1): Periodo | null {
  if (!p.from || !p.to) return null;
  const fmt = (a: Date, b: Date) => `${format(a, "dd/MM/yyyy")} — ${format(b, "dd/MM/yyyy")}`;
  switch (preset) {
    case "hoje": {
      const d = addDays(p.from, dir);
      return { from: startOfDay(d), to: endOfDay(d), label: format(d, "dd/MM/yyyy") };
    }
    case "prox7":
    case "ult7": {
      const f = addDays(p.from, 7 * dir), t = addDays(p.to, 7 * dir);
      return { from: startOfDay(f), to: endOfDay(t), label: fmt(f, t) };
    }
    case "prox30":
    case "ult30": {
      const f = addDays(p.from, 30 * dir), t = addDays(p.to, 30 * dir);
      return { from: startOfDay(f), to: endOfDay(t), label: fmt(f, t) };
    }
    case "mesatual": {
      const f = startOfMonth(addMonths(p.from, dir));
      return { from: f, to: endOfMonth(f), label: nomeMesAno(f) };
    }
    case "anoatual": {
      const f = startOfYear(addYears(p.from, dir));
      return { from: f, to: endOfYear(f), label: format(f, "yyyy") };
    }
    default:
      return null;
  }
}

export function PeriodoFilter({ value, onChange }: { value: Periodo; onChange: (p: Periodo) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PresetKey>("todos");
  const [activePreset, setActivePreset] = useState<PresetKey | null>(
    () => PRESETS.find((p) => p.label === value.label)?.k ?? null,
  );
  const [fromStr, setFromStr] = useState(value.from ? format(value.from, "dd/MM/yyyy") : "");
  const [toStr, setToStr] = useState(value.to ? format(value.to, "dd/MM/yyyy") : "");
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({
    from: value.from ?? undefined, to: value.to ?? undefined,
  });

  useEffect(() => {
    const match = PRESETS.find((p) => p.label === value.label)?.k;
    if (match) setActivePreset(match);
  }, [value.label]);

  const applyPreset = (k: PresetKey) => {
    if (k === "custom") { setMode("custom"); setActivePreset(null); return; }
    const p = PRESETS.find((x) => x.k === k)!.range();
    setActivePreset(k);
    onChange(p);
    setOpen(false);
  };

  const podeNavegar = !!activePreset && NAVEGAVEIS.includes(activePreset);

  const navegar = (dir: 1 | -1) => {
    if (!activePreset) return;
    const p = shiftPeriodo(value, activePreset, dir);
    if (p) onChange(p);
  };


  const applyCustom = () => {
    const f = parseBR(fromStr); const t = parseBR(toStr);
    if (!f || !t) return;
    setActivePreset(null);
    onChange({ from: startOfDay(f), to: endOfDay(t), label: `${fromStr} — ${toStr}` });
    setOpen(false);
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      {podeNavegar ? (
        <Button size="sm" variant="outline" className="h-9 w-9 shrink-0 rounded-xl px-0 shadow-sm transition-all hover:-translate-y-px hover:shadow-md" aria-label="Período anterior" onClick={() => navegar(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
      ) : (
        <span aria-hidden="true" className="h-9 w-9 shrink-0" />
      )}
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" title={`Período: ${value.label}`} className="h-9 w-[300px] justify-start rounded-xl px-3 shadow-sm transition-all hover:-translate-y-px hover:shadow-md">
          <CalendarIcon className="mr-1.5 h-4 w-4 shrink-0" />
          <span className="truncate tabular-nums">Período: {value.label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto overflow-hidden rounded-2xl p-0 shadow-xl">
        <div className="flex">
          <div className="flex w-52 flex-col gap-0.5 border-r p-2">
            {PRESETS.map((p) => (
              <button
                key={p.k}
                type="button"
                onClick={() => applyPreset(p.k)}
                className={`rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${value.label === p.label ? "bg-muted font-medium" : ""}`}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => applyPreset("custom")}
              className={`rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${mode === "custom" ? "bg-muted font-medium" : ""}`}
            >
              Período personalizado
            </button>
          </div>
          {mode === "custom" && (
            <div className="p-4">
              <div className="mb-3 grid grid-cols-2 gap-2.5">
                <div>
                  <Label className="text-xs">De</Label>
                  <Input
                    placeholder="dd/mm/aaaa"
                    value={fromStr}
                    onChange={(e) => setFromStr(e.target.value)}
                    className="h-9 rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-xs">Até</Label>
                  <Input
                    placeholder="dd/mm/aaaa"
                    value={toStr}
                    onChange={(e) => setToStr(e.target.value)}
                    className="h-9 rounded-xl"
                  />
                </div>
              </div>
              <Calendar
                mode="range"
                selected={range as { from: Date; to?: Date }}
                onSelect={(r: { from?: Date; to?: Date } | undefined) => {
                  const rr = r ?? {};
                  setRange(rr);
                  if (rr.from) setFromStr(format(rr.from, "dd/MM/yyyy"));
                  if (rr.to) setToStr(format(rr.to, "dd/MM/yyyy"));
                }}
                numberOfMonths={1}
                className="pointer-events-auto p-0"
              />
              <div className="mt-3 flex justify-end">
                <Button size="sm" className="h-9 rounded-xl px-5 shadow-sm transition-all hover:-translate-y-px hover:shadow-md" onClick={applyCustom}>Aplicar</Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
      {podeNavegar ? (
        <Button size="sm" variant="outline" className="h-9 w-9 shrink-0 rounded-xl px-0 shadow-sm transition-all hover:-translate-y-px hover:shadow-md" aria-label="Próximo período" onClick={() => navegar(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      ) : (
        <span aria-hidden="true" className="h-9 w-9 shrink-0" />
      )}
    </div>
  );
}
