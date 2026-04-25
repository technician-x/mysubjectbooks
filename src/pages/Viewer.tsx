import { useEffect, useRef, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
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
  const [scale, setScale] = useState(1.1);
  const [width, setWidth] = useState<number>(800);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfText, setPdfText] = useState("");
  const [pageTexts, setPageTexts] = useState<Record<number, string>>({});

  // Toolbar auto-hide
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);

  const showToolbar = useCallback(() => {
    setToolbarVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setToolbarVisible(false), 3000);
  }, []);

  useEffect(() => {
    showToolbar();
    return () => { if (hideTimer.current) window.clearTimeout(hideTimer.current); };
  }, [showToolbar]);

  useEffect(() => {
    if (!id) return;
    supabase.from("resources").select("id, title, pdf_url, allow_download, subject_id").eq("id", id).maybeSingle()
      .then(({ data }) => setResource(data));
  }, [id]);

  useEffect(() => {
    const onResize = () => {
      if (containerRef.current) setWidth(Math.min(containerRef.current.clientWidth - 24, 900));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resource]);

  const onLoaded = async (pdf: any) => {
    setNumPages(pdf.numPages);
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
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  if (!resource) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div
      className="fixed inset-0 bg-muted/50 flex flex-col animate-fade-in-fast"
      onMouseMove={showToolbar}
      onTouchStart={showToolbar}
    >
      {/* Minimal top bar with back + title */}
      <div className={`absolute top-0 left-0 right-0 z-20 transition-all duration-300 ${toolbarVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"}`}>
        <div className="bg-background/85 backdrop-blur border-b border-border">
          <div className="px-3 sm:px-4 h-14 flex items-center gap-2">
            <Link to={`/subject/${resource.subject_id}`} className="w-11 h-11 rounded-full hover:bg-muted flex items-center justify-center press" aria-label="Back">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </Link>
            <h1 className="font-heading font-semibold text-foreground truncate flex-1 min-w-0">{resource.title}</h1>
            {resource.allow_download && (
              <a href={resource.pdf_url} download target="_blank" rel="noreferrer" className="w-11 h-11 rounded-full hover:bg-muted flex items-center justify-center press" aria-label="Download">
                <Download className="w-5 h-5 text-foreground" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* PDF — full screen */}
      <div ref={containerRef} className="flex-1 overflow-auto py-16 px-2 sm:px-4">
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
              className="shadow-card rounded-card overflow-hidden bg-white"
              renderTextLayer
              renderAnnotationLayer
            />
          </Document>
        </div>
      </div>

      {/* Floating bottom toolbar — auto-hide */}
      <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-20 transition-all duration-300 ${toolbarVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>
        <div className="bg-background/95 backdrop-blur shadow-pop border border-border rounded-full px-2 py-1.5 flex items-center gap-1">
          <Button size="icon" variant="ghost" className="rounded-full h-10 w-10" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="text-sm text-foreground font-medium px-2 min-w-[64px] text-center">
            {page} / {numPages || "—"}
          </div>
          <Button size="icon" variant="ghost" className="rounded-full h-10 w-10" onClick={() => setPage((p) => Math.min(numPages, p + 1))} disabled={page >= numPages}>
            <ChevronRight className="w-5 h-5" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button size="icon" variant="ghost" className="rounded-full h-10 w-10" onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(scale * 100)}%</span>
          <Button size="icon" variant="ghost" className="rounded-full h-10 w-10" onClick={() => setScale((s) => Math.min(2.5, s + 0.2))}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button size="icon" variant="ghost" className="rounded-full h-10 w-10" onClick={fullscreen}>
            <Maximize className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <AIAssistant pdfText={pdfText} currentPage={page} pageTexts={pageTexts} />
    </div>
  );
}
