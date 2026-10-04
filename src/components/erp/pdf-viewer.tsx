import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Download, Printer, X } from "lucide-react";

export function PdfViewer({
  titulo,
  subtitulo,
  url,
  nomeArquivo,
  onClose,
  acoes,
  rev,
}: {
  titulo: string;
  subtitulo?: string;
  url: string;
  nomeArquivo: string;
  onClose: () => void;
  acoes?: any;
  rev?: string;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [zoom, setZoom] = useState(() =>
    typeof window === "undefined"
      ? 100
      : Math.min(200, Math.max(100, Math.round(window.innerWidth / 12))),
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  const baixar = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    a.click();
  };
  const imprimir = () => {
    const w = frameRef.current?.contentWindow;
    if (w) {
      w.focus();
      w.print();
    }
  };
  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <FileText className="h-4 w-4" />
        <span className="font-medium">{titulo}</span>
        {subtitulo && (
          <span className="max-w-full truncate text-xs text-muted-foreground">{subtitulo}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Reduzir zoom"
            onClick={() => setZoom((z) => Math.max(50, z - 10))}
          >
            −
          </Button>
          <span className="w-12 text-center text-xs text-muted-foreground">{zoom}%</span>
          <span className="text-[10px] text-muted-foreground/50">rev-20260918d</span>
          {rev && <span className="text-[10px] text-muted-foreground/50">pdf-{rev}</span>}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Ampliar zoom"
            onClick={() => setZoom((z) => Math.min(200, z + 10))}
          >
            +
          </Button>
          <Button size="sm" variant="outline" onClick={baixar}>
            <Download className="mr-1 h-3.5 w-3.5" /> Baixar
          </Button>
          <Button size="sm" variant="outline" onClick={imprimir}>
            <Printer className="mr-1 h-3.5 w-3.5" /> Imprimir
          </Button>
          {acoes}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Fechar (Esc)"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-muted/40">
        <iframe
          ref={frameRef}
          src={`${url}#toolbar=0&navpanes=0&zoom=${zoom}`}
          title={titulo}
          className="h-full min-h-[70vh] w-full border-0 bg-white"
        />
      </div>
    </div>
  );
}
