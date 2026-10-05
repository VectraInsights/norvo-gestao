import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Download, Printer, X, ChevronLeft, ChevronRight, Loader2, Expand } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

if (typeof window !== "undefined") {
  try { pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker; } catch {}
}

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
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [doc, setDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState(1);
  const [page, setPage] = useState(1);
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [printing, setPrinting] = useState(false);
  const renderToken = useRef(0);

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

  // Carrega o documento
  useEffect(() => {
    let dead = false;
    setLoading(true);
    setErro("");
    setPage(1);
    setZoom(100);
    (async () => {
      try {
        const d = await (pdfjsLib as any).getDocument({ url, verbosity: 0 }).promise;
        if (dead) { try { d.destroy(); } catch {} return; }
        const p1 = await d.getPage(1);
        const w1 = p1.getViewport({ scale: 1 }).width;
        const cw = Math.max(320, (wrapRef.current?.clientWidth || 900) - 48);
        if (!dead) {
          setDoc(d);
          setNumPages(d.numPages || 1);
          setFit(cw / w1);
          setLoading(false);
        }
      } catch {
        if (!dead) { setErro("Não foi possível exibir o PDF aqui. Use Baixar."); setLoading(false); }
      }
    })();
    return () => { dead = true; };
  }, [url]);

  // Renderiza a página atual
  useEffect(() => {
    if (!doc || loading) return;
    const token = ++renderToken.current;
    let task: any = null;
    (async () => {
      try {
        const pg = await doc.getPage(page);
        if (token !== renderToken.current) return;
        const scale = Math.min(4, Math.max(0.3, fit * (zoom / 100)));
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const vp = pg.getViewport({ scale: scale * dpr });
        const canvas = canvasRef.current;
        if (!canvas || token !== renderToken.current) return;
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
        canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        task = pg.render({ canvasContext: ctx, viewport: vp });
        await task.promise;
      } catch (e: any) {
        if (e?.name !== "RenderingCancelledException") {
          // mantém o último frame; erro real de carga já tratado acima
        }
      }
    })();
    return () => { try { task?.cancel(); } catch {} };
  }, [doc, page, zoom, fit, loading]);

  const baixar = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeArquivo;
    a.click();
  };

  const imprimir = useCallback(async () => {
    if (!doc || printing) return;
    setPrinting(true);
    try {
      const imgs: string[] = [];
      for (let i = 1; i <= (doc.numPages || 1); i++) {
        const pg = await doc.getPage(i);
        const vp = pg.getViewport({ scale: 1.6 });
        const c = document.createElement("canvas");
        c.width = Math.floor(vp.width);
        c.height = Math.floor(vp.height);
        await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
        imgs.push(c.toDataURL("image/png"));
      }
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.write(
        `<html><head><title>${titulo}</title><style>@page{size:A4;margin:8mm}body{margin:0}img{width:100%;display:block;page-break-inside:avoid}</style></head><body>` +
        imgs.map((s) => `<img src="${s}"/>`).join("") +
        `<script>onload=()=>{focus();print();}</script></body></html>`,
      );
      w.document.close();
    } finally {
      setPrinting(false);
    }
  }, [doc, printing, titulo]);

  const irPara = (p: number) => setPage(Math.min(Math.max(1, p), numPages));

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      <div className="flex flex-wrap items-center gap-2 bg-primary px-4 py-2 text-primary-foreground">
        <FileText className="h-4 w-4" />
        <span className="font-semibold">{titulo}</span>
        {subtitulo && (
          <span className="max-w-full truncate text-xs text-primary-foreground/80">{subtitulo}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
            title="Página anterior"
            disabled={page <= 1}
            onClick={() => irPara(page - 1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-14 text-center text-xs">
            {page}/{numPages}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
            title="Próxima página"
            disabled={page >= numPages}
            onClick={() => irPara(page + 1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="mx-1 h-5 w-px bg-white/25" />
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
            title="Reduzir zoom"
            onClick={() => setZoom((z) => Math.max(50, z - 10))}
          >
            −
          </Button>
          <span className="w-12 text-center text-xs">{zoom}%</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
            title="Ajustar à largura"
            onClick={() => setZoom(100)}
          >
            <Expand className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
            title="Ampliar zoom"
            onClick={() => setZoom((z) => Math.min(300, z + 10))}
          >
            +
          </Button>
          {rev && <span className="text-[10px] text-primary-foreground/60">pdf-{rev}</span>}
          <Button
            size="sm"
            variant="secondary"
            onClick={baixar}
          >
            <Download className="mr-1 h-3.5 w-3.5" /> Baixar
          </Button>
          <Button size="sm" variant="secondary" onClick={imprimir} disabled={printing || loading}>
            <Printer className="mr-1 h-3.5 w-3.5" /> {printing ? "Gerando..." : "Imprimir"}
          </Button>
          {acoes}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-primary-foreground hover:bg-white/15 hover:text-primary-foreground"
            title="Fechar (Esc)"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div ref={wrapRef} className="flex flex-1 items-start justify-center overflow-auto bg-muted/40 p-4">
        {loading && (
          <div className="mt-20 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Carregando documento...
          </div>
        )}
        {!loading && erro && (
          <div className="mt-20 text-center text-sm text-muted-foreground">
            <p>{erro}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={baixar}>
              <Download className="mr-1 h-3.5 w-3.5" /> Baixar PDF
            </Button>
          </div>
        )}
        {!loading && !erro && (
          <canvas ref={canvasRef} className="bg-white shadow-panel" />
        )}
      </div>
    </div>
  );
}
