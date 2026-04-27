import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, ZoomIn, ZoomOut, Maximize, Download, Loader2,
  Search, X, ChevronUp, ChevronDown,
} from "lucide-react";
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
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.1);
  const [width, setWidth] = useState<number>(800);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const [pdfText, setPdfText] = useState("");
  const [pageTexts, setPageTexts] = useState<Record<number, string>>({});

  // Toolbar auto-hide
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const hideTimer = useRef<number | null>(null);

  // Search
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchHits, setSearchHits] = useState<{ page: number; snippet: string }[]>([]);
  const [activeHit, setActiveHit] = useState(0);

  const showToolbar = useCallback(() => {
    setToolbarVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setToolbarVisible(false), 3500);
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
      if (containerRef.current) setWidth(Math.min(containerRef.current.clientWidth - 32, 900));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [resource]);

  const onLoaded = async (pdf: any) => {
    setNumPages(pdf.numPages);
    let all = "";
    const map: Record<number, string> = {};
    for (let i = 1; i <= Math.min(pdf.numPages, 200); i++) {
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
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  };

  // Track current page on scroll using IntersectionObserver
  useEffect(() => {
    if (!numPages) return;
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const pageNum = Number((visible.target as HTMLElement).dataset.page);
          if (pageNum) setCurrentPage(pageNum);
        }
      },
      { root, threshold: [0.25, 0.5, 0.75] }
    );
    Object.values(pageRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [numPages]);

  // Compute search hits
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!q) { setSearchHits([]); setActiveHit(0); return; }
    const hits: { page: number; snippet: string }[] = [];
    Object.entries(pageTexts).forEach(([pStr, text]) => {
      const lower = text.toLowerCase();
      let idx = lower.indexOf(q);
      while (idx !== -1 && hits.filter(h => h.page === Number(pStr)).length < 3) {
        const start = Math.max(0, idx - 40);
        const end = Math.min(text.length, idx + q.length + 40);
        hits.push({ page: Number(pStr), snippet: text.slice(start, end) });
        idx = lower.indexOf(q, idx + q.length);
      }
    });
    hits.sort((a, b) => a.page - b.page);
    setSearchHits(hits);
    setActiveHit(0);
  }, [query, pageTexts]);

  const scrollToPage = useCallback((pageNum: number) => {
    const el = pageRefs.current[pageNum];
    if (el && containerRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const jumpToHit = (i: number) => {
    if (!searchHits.length) return;
    const next = (i + searchHits.length) % searchHits.length;
    setActiveHit(next);
    scrollToPage(searchHits[next].page);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Highlight matches inside rendered text layer of visible pages
  const highlightTerm = useMemo(() => query.trim(), [query]);
  useEffect(() => {
    // Inject a tiny stylesheet rule once (no-op if already present)
    const id = "pdf-highlight-style";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = `.pdf-hl{background: hsl(var(--primary) / 0.35); border-radius:2px;}`;
      document.head.appendChild(style);
    }
  }, []);

  if (!resource) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 bg-muted/40 flex flex-col animate-fade-in-fast"
      onMouseMove={showToolbar}
      onTouchStart={showToolbar}
    >
      {/* Top bar */}
      <div className={`absolute top-0 left-0 right-0 z-30 transition-all duration-300 ${toolbarVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"}`}>
        <div className="bg-background/85 backdrop-blur-md border-b border-border">
          <div className="px-3 sm:px-4 h-14 flex items-center gap-2">
            <Link to={`/subject/${resource.subject_id}`} className="w-10 h-10 rounded-full hover:bg-muted flex items-center justify-center press" aria-label="Back">
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </Link>
            <h1 className="font-heading font-semibold text-foreground truncate flex-1 min-w-0 text-[15px]">{resource.title}</h1>
            <button
              onClick={() => setSearchOpen((v) => !v)}
              className={`w-10 h-10 rounded-full flex items-center justify-center press transition-colors ${searchOpen ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"}`}
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </button>
            {resource.allow_download && (
              <a href={resource.pdf_url} download target="_blank" rel="noreferrer" className="w-10 h-10 rounded-full hover:bg-muted flex items-center justify-center press" aria-label="Download">
                <Download className="w-5 h-5 text-foreground" />
              </a>
            )}
          </div>

          {/* Search bar */}
          {searchOpen && (
            <div className="border-t border-border bg-background/95 backdrop-blur-md animate-fade-in">
              <div className="px-3 sm:px-4 py-2.5 flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && jumpToHit(activeHit + (e.shiftKey ? -1 : 1) - (searchHits.length ? 0 : 0))}
                    placeholder="Search in PDF…"
                    className="pl-9 h-10 rounded-input"
                  />
                </div>
                <div className="text-xs text-muted-foreground tabular-nums min-w-[68px] text-center">
                  {searchHits.length ? `${activeHit + 1} / ${searchHits.length}` : query ? "0 / 0" : ""}
                </div>
                <Button size="icon" variant="ghost" className="h-10 w-10 rounded-full" disabled={!searchHits.length} onClick={() => jumpToHit(activeHit - 1)}>
                  <ChevronUp className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-10 w-10 rounded-full" disabled={!searchHits.length} onClick={() => jumpToHit(activeHit + 1)}>
                  <ChevronDown className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-10 w-10 rounded-full" onClick={() => { setSearchOpen(false); setQuery(""); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Result list (compact) */}
              {query && searchHits.length > 0 && (
                <div className="max-h-44 overflow-auto border-t border-border bg-background">
                  {searchHits.map((h, i) => (
                    <button
                      key={i}
                      onClick={() => jumpToHit(i)}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-muted/70 transition-colors ${i === activeHit ? "bg-primary-soft" : ""}`}
                    >
                      <span className="text-xs font-medium text-primary mr-2">p.{h.page}</span>
                      <span className="text-foreground/80">…{h.snippet}…</span>
                    </button>
                  ))}
                </div>
              )}
              {query && searchHits.length === 0 && (
                <div className="px-4 py-3 text-sm text-muted-foreground border-t border-border">No matches found</div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* PDF — continuous vertical scroll */}
      <div ref={containerRef} className="flex-1 overflow-auto pt-16 pb-24 px-2 sm:px-4 scroll-smooth">
        <div className="flex flex-col items-center gap-4">
          <Document
            file={resource.pdf_url}
            onLoadSuccess={onLoaded}
            onLoadError={(e) => toast.error("Failed to load PDF: " + e.message)}
            loading={
              <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span className="text-sm">Loading PDF…</span>
              </div>
            }
          >
            {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
              <div
                key={pageNum}
                ref={(el) => (pageRefs.current[pageNum] = el)}
                data-page={pageNum}
                className="relative animate-fade-in-fast"
              >
                <Page
                  pageNumber={pageNum}
                  width={width * scale}
                  className="shadow-card rounded-card overflow-hidden bg-white"
                  renderTextLayer
                  renderAnnotationLayer
                  customTextRenderer={highlightTerm ? ({ str }: any) => {
                    const safe = highlightTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                    return str.replace(new RegExp(`(${safe})`, "gi"), `<mark class="pdf-hl">$1</mark>`);
                  } : undefined}
                />
                <div className="absolute -left-2 top-2 sm:left-2 px-2 py-0.5 rounded-full bg-background/80 backdrop-blur text-[11px] text-muted-foreground font-medium shadow-card">
                  {pageNum}
                </div>
              </div>
            ))}
          </Document>
        </div>
      </div>

      {/* Floating bottom toolbar */}
      <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-20 transition-all duration-300 ${toolbarVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"}`}>
        <div className="bg-background/95 backdrop-blur-md shadow-pop border border-border rounded-full px-2 py-1.5 flex items-center gap-1">
          <div className="text-sm text-foreground font-medium px-3 min-w-[72px] text-center tabular-nums">
            {currentPage} / {numPages || "—"}
          </div>
          <div className="w-px h-6 bg-border mx-1" />
          <Button size="icon" variant="ghost" className="rounded-full h-10 w-10" onClick={() => setScale((s) => Math.max(0.6, +(s - 0.2).toFixed(2)))}>
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <Button size="icon" variant="ghost" className="rounded-full h-10 w-10" onClick={() => setScale((s) => Math.min(2.5, +(s + 0.2).toFixed(2)))}>
            <ZoomIn className="w-4 h-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button size="icon" variant="ghost" className="rounded-full h-10 w-10" onClick={fullscreen}>
            <Maximize className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <AIAssistant pdfText={pdfText} currentPage={currentPage} pageTexts={pageTexts} />
    </div>
  );
}
