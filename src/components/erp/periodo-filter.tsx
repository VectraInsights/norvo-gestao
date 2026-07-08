import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon } from "lucide-react";
import {
  startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear,
  addDays, subDays, format, parse, isValid,
} from "date-fns";

export type Periodo = { from: Date | null; to: Date | null; label: string };

export const PERIODO_TODOS: Periodo = { from: null, to: null, label: "Todo o período" };

type PresetKey =
  | "hoje" | "prox7" | "prox30" | "ult7" | "ult30"
  | "mesatual" | "anoatual" | "todos" | "custom";

const PRESETS: { k: PresetKey; label: string; range: () => Periodo }[] = [
  { k: "hoje", label: "Hoje", range: () => { const d = new Date(); return { from: startOfDay(d), to: endOfDay(d), label: "Hoje" }; } },
  { k: "prox7", label: "Próximos 7 dias", range: () => ({ from: startOfDay(new Date()), to: endOfDay(addDays(new Date(), 7)), label: "Próximos 7 dias" }) },
  { k: "prox30", label: "Próximos 30 dias", range: () => ({ from: startOfDay(new Date()), to: endOfDay(addDays(new Date(), 30)), label: "Próximos 30 dias" }) },
  { k: "ult7", label: "Últimos 7 dias", range: () => ({ from: startOfDay(subDays(new Date(), 7)), to: endOfDay(new Date()), label: "Últimos 7 dias" }) },
  { k: "ult30", label: "Últimos 30 dias", range: () => ({ from: startOfDay(subDays(new Date(), 30)), to: endOfDay(new Date()), label: "Últimos 30 dias" }) },
  { k: "mesatual", label: "Mês atual", range: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()), label: "Mês atual" }) },
  { k: "anoatual", label: "Ano atual", range: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()), label: "Ano atual" }) },
  { k: "todos", label: "Todo o período", range: () => PERIODO_TODOS },
];

function parseBR(s: string): Date | null {
  const d = parse(s, "dd/MM/yyyy", new Date());
  return isValid(d) ? d : null;
}

export function PeriodoFilter({ value, onChange }: { value: Periodo; onChange: (p: Periodo) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<PresetKey>("todos");
  const [fromStr, setFromStr] = useState(value.from ? format(value.from, "dd/MM/yyyy") : "");
  const [toStr, setToStr] = useState(value.to ? format(value.to, "dd/MM/yyyy") : "");
  const [range, setRange] = useState<{ from?: Date; to?: Date }>({
    from: value.from ?? undefined, to: value.to ?? undefined,
  });

  const applyPreset = (k: PresetKey) => {
    if (k === "custom") { setMode("custom"); return; }
    const p = PRESETS.find((x) => x.k === k)!.range();
    onChange(p);
    setOpen(false);
  };

  const applyCustom = () => {
    const f = parseBR(fromStr); const t = parseBR(toStr);
    if (!f || !t) return;
    onChange({ from: startOfDay(f), to: endOfDay(t), label: `${fromStr} — ${toStr}` });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <CalendarIcon className="mr-1 h-4 w-4" />
          Período: {value.label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex">
          <div className="flex w-48 flex-col border-r p-1">
            {PRESETS.map((p) => (
              <button
                key={p.k}
                type="button"
                onClick={() => applyPreset(p.k)}
                className={`rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${value.label === p.label ? "bg-muted font-medium" : ""}`}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => applyPreset("custom")}
              className={`rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${mode === "custom" ? "bg-muted font-medium" : ""}`}
            >
              Período personalizado
            </button>
          </div>
          {mode === "custom" && (
            <div className="p-3">
              <div className="mb-2 grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">De</Label>
                  <Input
                    placeholder="dd/mm/aaaa"
                    value={fromStr}
                    onChange={(e) => setFromStr(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">Até</Label>
                  <Input
                    placeholder="dd/mm/aaaa"
                    value={toStr}
                    onChange={(e) => setToStr(e.target.value)}
                    className="h-8"
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
              <div className="mt-2 flex justify-end">
                <Button size="sm" onClick={applyCustom}>Aplicar</Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
