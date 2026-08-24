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
};

// Campo de data nativo + ícone de calendário (popover) para escolher visualmente.
export function DateInput({ value, onChange, required, disabled, className, id }: DateInputProps) {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value + "T00:00:00") : undefined;
  return (
    <div className={cn("relative flex items-center", className)}>
      <Input
        id={id}
        type="date"
        required={required}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="pr-9"
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
            className="absolute right-0.5 h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
          >
            <CalendarIcon className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar
            mode="single"
            locale={ptBR}
            selected={selected}
            defaultMonth={selected ?? new Date()}
            onSelect={(d) => {
              if (d) {
                onChange(format(d, "yyyy-MM-dd"));
                setOpen(false);
              }
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
