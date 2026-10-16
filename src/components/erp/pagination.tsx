import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";

type PaginationProps = {
  pagina: number;
  totalPaginas: number;
  total: number;
  pageSize: number;
  onPagina: (p: number) => void;
  /** ex.: [10, 25, 50, 100]; omitido = sem seletor */
  pageSizes?: number[];
  onPageSize?: (n: number) => void;
  /** substitui o "Mostrando X–Y de Z" da esquerda */
  summary?: ReactNode;
};

// Rodapé de paginação padrão do ERP.
export function Pagination({
  pagina,
  totalPaginas,
  total,
  pageSize,
  onPagina,
  pageSizes,
  onPageSize,
  summary,
}: PaginationProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm text-muted-foreground">
      {summary ?? (
        <span>
          Mostrando {(pagina - 1) * pageSize + 1}–{Math.min(pagina * pageSize, total)} de {total}
        </span>
      )}
      <div className="flex items-center gap-1">
        {pageSizes && onPageSize && (
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              onPageSize(Number(v));
            }}
          >
            <SelectTrigger className="h-8 w-[88px] rounded-lg text-xs shadow-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizes.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} / pág.
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Página anterior"
          disabled={pagina === 1}
          onClick={() => onPagina(Math.max(1, pagina - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <span className="px-2 text-xs">
          Página {pagina} de {totalPaginas}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Próxima página"
          disabled={pagina === totalPaginas}
          onClick={() => onPagina(Math.min(totalPaginas, pagina + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
