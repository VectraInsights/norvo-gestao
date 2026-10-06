import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DateInputProps = {
  value?: string;
  onChange: (v: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  id?: string;
  maxToday?: boolean;
};

// Campo de data nativo + ícone de calendário (popover) com dropdown mês/ano e bloqueio de datas futuras
export function DateInput({ value, onChange, required, disabled, className, id, maxToday }: DateInputProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value + "T00:00:00") : undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (
    <div className={cn("relative flex items-center", className)}>
      <Input
        id={id}
        type="date"
        required={required}
        value={value ?? ""}
        disabled={disabled}
        max={maxToday ? format(today, "yyyy-MM-dd") : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="pr-9 [&::-webkit-calendar-picker-indicator]:hidden"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            tabIndex={-1}
            aria-label="Abrir calendário"
            title="Escolher no calendário"
            className="absolute right-1 h-8 w-8 shrink-0 rounded-lg text-muted-foreground transition-colors hover:text-foreground"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto overflow-hidden rounded-2xl border p-0 shadow-xl" align="end">
          <Calendar
            mode="single"
            locale={ptBR}
            captionLayout="dropdown"
            selected={selected}
            defaultMonth={selected ?? today}
            disabled={maxToday ? { after: today } : undefined}
            onSelect={(d) => {
              if (d) {
                onChange(format(d, "yyyy-MM-dd"));
                setOpen(false);
              }
            }}
          />
          <div className="flex items-center border-t bg-muted/40 px-4 py-2.5">
            <span className="text-xs text-muted-foreground">Hoje: {format(today, "dd/MM/yyyy")}</span>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
