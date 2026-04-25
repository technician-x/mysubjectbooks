import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Download, Loader2 } from "lucide-react";
import AIAssistant from "@/components/AIAssistant";
import { toast } from "sonner";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Resource = {
  id: string; title: string; pdf_url: string; allow_download: boolean; subject_id: string;
};

export default function Viewer() {
  const { id } = useParams();
  const [resource, setResource] = useState<Resource | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [width, setWidth] = useState<number>(800);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfText, setPdfText] = useState("");
  const [pageTexts, setPageTexts] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!id) return;
    supabase.from("resources").select("id, title, pdf_url, allow_download, subject_id").eq("id", id).maybeSingle()
      .then(({ data }) => setResource(data));
  }, [id]);

  useEffect(() => {
    const onResize = () => {
      if (containerRef.current) setWidth(Math.min(containerRef.current.clientWidth - 32, 900));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resource]);

  const onLoaded = async (pdf: any) => {
    setNumPages(pdf.numPages);
    // Extract text from all pages
    let all = "";
    const map: Record<number, string> = {};
    for (let i = 1; i <= Math.min(pdf.numPages, 100); i++) {
      try {
        const p = await pdf.getPage(i);
        const tc = await p.getTextContent();
        const txt = tc.items.map((it: any) => it.str).join(" ");
        map[i] = txt;
        all += `\n--- Page ${i} ---\n${txt}`;
      } catch {}
    }
    setPdfText(all);
    setPageTexts(map);
  };

  const fullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  if (!resource) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      {/* Toolbar */}
      <div className="bg-card border-b sticky top-0 z-30 shadow-sm">
        <div className="container mx-auto px-4 py-3 flex items-center gap-2 flex-wrap">
          <Link to={`/subject/${resource.subject_id}`} className="text-muted-foreground hover:text-foreground transition-smooth">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-semibold text-foreground truncate flex-1 min-w-0">{resource.title}</h1>

          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Input
              type="number"
              value={page}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                if (!isNaN(v) && v >= 1 && v <= numPages) setPage(v);
              }}
              className="w-14 h-8 text-center"
            />
            <span className="text-sm text-muted-foreground">/ {numPages || "—"}</span>
            <Button size="icon" variant="ghost" onClick={() => setPage((p) => Math.min(numPages, p + 1))} disabled={page >= numPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}><ZoomOut className="w-4 h-4" /></Button>
            <span className="text-sm text-muted-foreground w-12 text-center">{Math.round(scale * 100)}%</span>
            <Button size="icon" variant="ghost" onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}><ZoomIn className="w-4 h-4" /></Button>
          </div>

          <Button size="icon" variant="ghost" onClick={fullscreen}><Maximize className="w-4 h-4" /></Button>
          {resource.allow_download && (
            <Button size="icon" variant="ghost" asChild>
              <a href={resource.pdf_url} download target="_blank" rel="noreferrer"><Download className="w-4 h-4" /></a>
            </Button>
          )}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-auto py-6">
        <div className="flex justify-center">
          <Document
            file={resource.pdf_url}
            onLoadSuccess={onLoaded}
            onLoadError={(e) => toast.error("Failed to load PDF: " + e.message)}
            loading={<div className="py-20 text-muted-foreground flex items-center gap-2"><Loader2 className="w-5 h-5 animate-spin" /> Loading PDF…</div>}
          >
            <Page
              pageNumber={page}
              width={width * scale}
              className="shadow-elegant rounded-xl overflow-hidden bg-white"
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>
        </div>
      </div>

      <AIAssistant pdfText={pdfText} currentPage={page} pageTexts={pageTexts} />
    </div>
  );
}
