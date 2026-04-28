import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sparkles, X, Send, Mic, MicOff, Volume2, Pause, Play, Square, Loader2,
  MessageCircle, BookOpen, HelpCircle, Copy, Check, RotateCcw, Bot,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Lang = "en" | "hi";
type Msg = { role: "user" | "assistant"; content: string; lang: Lang; streaming?: boolean };

// Strip markdown / emoji / special chars so TTS reads naturally
function sanitizeForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~`#>|]/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkForSpeech(text: string, max = 180): string[] {
  const clean = sanitizeForSpeech(text);
  if (!clean) return [];
  const sentences = clean.split(/(?<=[।.!?])\s+/);
  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).trim().length > max) {
      if (buf) chunks.push(buf.trim());
      if (s.length > max) {
        for (let i = 0; i < s.length; i += max) chunks.push(s.slice(i, i + max));
        buf = "";
      } else buf = s;
    } else buf = (buf ? buf + " " : "") + s;
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

export default function AIAssistant({
  pdfText,
  currentPage,
  pageTexts,
}: {
  pdfText: string;
  currentPage: number;
  pageTexts: Record<number, string>;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("ask");
  const [lang, setLang] = useState<Lang>("hi");

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recogRef = useRef<any>(null);

  const [speakingState, setSpeakingState] = useState<"idle" | "speaking" | "paused">("idle");
  const speakQueueRef = useRef<SpeechSynthesisUtterance[]>([]);

  const [explanation, setExplanation] = useState("");
  const [explanationLang, setExplanationLang] = useState<Lang>("hi");
  const [explainLoading, setExplainLoading] = useState(false);

  const [voicesReady, setVoicesReady] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, streamingText]);

  useEffect(() => {
    if (open && tab === "ask") setTimeout(() => inputRef.current?.focus(), 250);
  }, [open, tab]);

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, [input]);

  // Lock body scroll on mobile when open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => {
      const v = window.speechSynthesis.getVoices();
      if (v.length) setVoicesReady(true);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
  }, []);

  const hindiVoiceAvailable = useMemo(() => {
    if (!voicesReady || !("speechSynthesis" in window)) return true;
    const v = window.speechSynthesis.getVoices();
    return v.some((x) => x.lang?.toLowerCase().startsWith("hi"));
  }, [voicesReady]);

  const findVoice = (target: Lang): SpeechSynthesisVoice | null => {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (target === "hi") {
      const hi = voices.filter((v) => v.lang?.toLowerCase().startsWith("hi"));
      const score = (v: SpeechSynthesisVoice) => {
        const n = v.name.toLowerCase();
        let s = 0;
        if (n.includes("google")) s += 100;
        if (n.includes("natural")) s += 80;
        if (n.includes("neural")) s += 80;
        if (n.includes("microsoft")) s += 60;
        if (n.includes("madhur") || n.includes("swara") || n.includes("kalpana") || n.includes("hemant")) s += 50;
        if (n.includes("female")) s += 10;
        if (v.lang === "hi-IN") s += 30;
        if ((v as any).localService) s += 5;
        return s;
      };
      hi.sort((a, b) => score(b) - score(a));
      return hi[0] || null;
    }
    const en = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
    const score = (v: SpeechSynthesisVoice) => {
      const n = v.name.toLowerCase();
      let s = 0;
      if (n.includes("google")) s += 100;
      if (n.includes("natural") || n.includes("neural")) s += 80;
      if (n.includes("microsoft")) s += 60;
      if (v.lang === "en-US" || v.lang === "en-GB") s += 20;
      return s;
    };
    en.sort((a, b) => score(b) - score(a));
    return en[0] || null;
  };

  const streamAI = async (
    mode: "ask" | "explain",
    question: string | undefined,
    onDelta: (chunk: string) => void
  ): Promise<string> => {
    const text = mode === "explain"
      ? (pageTexts[currentPage] || pdfText.slice(0, 8000))
      : pdfText.slice(0, 12000);

    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token || SUPABASE_KEY;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/pdf-ai`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ mode, question, pdfText: text, pageNumber: currentPage, language: lang, stream: true }),
    });

    if (!res.ok || !res.body) {
      let msg = "AI request failed";
      try { const j = await res.json(); msg = j.error || msg; } catch { /* ignore */ }
      throw new Error(msg);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const raw of lines) {
        const line = raw.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content ?? "";
          if (delta) { full += delta; onDelta(delta); }
        } catch { /* ignore parse errors */ }
      }
    }
    return full;
  };

  const handleAsk = async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question) return;
    const askLang = lang;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: question, lang: askLang }]);
    setLoading(true);
    setStreamingText("");
    try {
      let acc = "";
      const final = await streamAI("ask", question, (delta) => {
        acc += delta;
        setStreamingText(acc);
      });
      const answer = final || acc;
      setStreamingText("");
      setMessages((m) => [...m, { role: "assistant", content: answer, lang: askLang }]);
      if (tab === "voice") speak(answer, askLang);
    } catch (e: any) {
      setStreamingText("");
      toast.error(e.message || "Failed to get answer");
    } finally {
      setLoading(false);
    }
  };

  const regenerate = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    setMessages((m) => {
      const copy = [...m];
      if (copy.length && copy[copy.length - 1].role === "assistant") copy.pop();
      return copy;
    });
    handleAsk(lastUser.content);
  };

  const copyMsg = async (text: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch { toast.error("Copy failed"); }
  };

  const speak = (text: string, speakLang: Lang = lang) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    speakQueueRef.current = [];

    const voice = findVoice(speakLang);
    if (speakLang === "hi" && !voice) {
      toast.warning("Hindi voice not installed. Please install a Hindi TTS voice in your OS settings.");
      return;
    }

    const chunks = chunkForSpeech(text);
    if (!chunks.length) return;

    const utterances = chunks.map((chunk, i) => {
      const u = new SpeechSynthesisUtterance(chunk);
      if (voice) u.voice = voice;
      u.lang = speakLang === "hi" ? "hi-IN" : "en-US";
      u.rate = speakLang === "hi" ? 0.92 : 1.0;
      u.pitch = 1.0;
      u.volume = 1.0;
      u.onend = () => { if (i === chunks.length - 1) setSpeakingState("idle"); };
      u.onerror = () => setSpeakingState("idle");
      return u;
    });

    speakQueueRef.current = utterances;
    setSpeakingState("speaking");
    utterances.forEach((u) => window.speechSynthesis.speak(u));
  };

  const pauseSpeech = () => { window.speechSynthesis.pause(); setSpeakingState("paused"); };
  const resumeSpeech = () => { window.speechSynthesis.resume(); setSpeakingState("speaking"); };
  const stopSpeech = () => { window.speechSynthesis.cancel(); speakQueueRef.current = []; setSpeakingState("idle"); };

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("Voice input not supported in this browser"); return; }
    const recog = new SR();
    recog.lang = lang === "hi" ? "hi-IN" : "en-US";
    recog.interimResults = true;
    recog.continuous = false;
    recog.maxAlternatives = 3;
    setInterim("");

    let finalCaptured = "";
    let lastInterim = "";
    let submitted = false;

    const submit = (text: string) => {
      const t = text.trim();
      if (!t || submitted) return;
      submitted = true;
      setInterim("");
      setListening(false);
      handleAsk(t);
    };

    recog.onresult = (e: any) => {
      let interimTxt = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalCaptured += r[0].transcript;
        else interimTxt += r[0].transcript;
      }
      lastInterim = interimTxt;
      if (interimTxt) setInterim(interimTxt);
      if (finalCaptured && !submitted) {
        try { recog.stop(); } catch { /* noop */ }
        submit(finalCaptured);
      }
    };
    recog.onerror = (e: any) => {
      if (e.error === "no-speech") toast.info(lang === "hi" ? "कोई आवाज़ नहीं सुनाई दी" : "No speech detected");
      else if (e.error === "not-allowed") toast.error("Microphone permission denied");
      else if (e.error === "aborted") { /* ignore */ }
      else toast.error(`Mic error: ${e.error}`);
      setListening(false);
      setInterim("");
    };
    recog.onend = () => {
      // Fallback: if recognition ended without firing isFinal, use whatever we captured
      if (!submitted) {
        const text = (finalCaptured || lastInterim).trim();
        if (text) submit(text);
        else { setListening(false); setInterim(""); }
      }
    };
    try {
      recog.start();
      recogRef.current = recog;
      setListening(true);
    } catch (err: any) {
      toast.error("Could not start microphone");
      setListening(false);
    }
  };

  const stopListening = () => {
    try { recogRef.current?.stop(); } catch { /* noop */ }
    // Don't clear listening here; onend will handle submission
  };

  const handleExplain = async () => {
    setExplainLoading(true);
    setExplanation("");
    const explainLang = lang;
    setExplanationLang(explainLang);
    try {
      let acc = "";
      const final = await streamAI("explain", undefined, (delta) => {
        acc += delta;
        setExplanation(acc);
      });
      const ans = final || acc;
      setExplanation(ans);
      speak(ans, explainLang);
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setExplainLoading(false);
    }
  };

  useEffect(() => () => { window.speechSynthesis?.cancel(); recogRef.current?.stop?.(); }, []);

  const LangToggle = () => (
    <div className="inline-flex gap-0.5 p-0.5 bg-muted rounded-full">
      <button
        onClick={() => setLang("en")}
        className={`px-2.5 py-1 text-xs font-semibold rounded-full transition-all ${lang === "en" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
        aria-label="English"
      >
        EN
      </button>
      <button
        onClick={() => setLang("hi")}
        className={`px-2.5 py-1 text-xs font-semibold rounded-full transition-all font-hindi ${lang === "hi" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
        aria-label="Hindi"
      >
        हिं
      </button>
    </div>
  );

  const TypingDots = () => (
    <div className="flex items-center gap-1 py-1.5">
      <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: "300ms" }} />
    </div>
  );

  const Markdown = ({ text, hindi }: { text: string; hindi: boolean }) => (
    <div className={`prose prose-sm max-w-none break-words prose-p:my-2 prose-headings:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-strong:text-foreground prose-code:text-foreground prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none ${hindi ? "font-hindi text-[15px] leading-[1.7]" : "text-[15px] leading-[1.6]"}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );

  const suggestions = lang === "hi"
    ? ["इस पृष्ठ का सारांश दें", "मुख्य बिंदु क्या हैं?", "सरल शब्दों में समझाएँ"]
    : ["Summarize this page", "Key points?", "Explain simply"];

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="group fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-40 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-primary text-primary-foreground shadow-pop hover:scale-110 active:scale-95 transition-all duration-300 flex items-center justify-center"
          aria-label="Open AI Assistant"
        >
          <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping opacity-40 group-hover:opacity-70" />
          <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 relative" />
        </button>
      )}

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm sm:bg-foreground/20 animate-fade-in-fast"
            onClick={() => setOpen(false)}
          />

          <div
            className="fixed z-50 bg-card flex flex-col overflow-hidden shadow-pop border border-border/60
                       inset-x-0 bottom-0 top-0 sm:top-auto h-full sm:h-[92vh] sm:max-h-[92vh] rounded-none sm:rounded-t-3xl
                       sm:inset-y-0 sm:right-0 sm:left-auto sm:bottom-0 sm:h-full sm:w-[440px] md:w-[480px] sm:max-h-none sm:rounded-none sm:rounded-l-2xl
                       animate-slide-in-bottom sm:animate-slide-in-right"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Header */}
            <div className="relative px-4 sm:px-5 pt-4 pb-3 border-b border-border/60 bg-gradient-to-br from-primary/10 via-card to-card overflow-hidden shrink-0">
              <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
              <div className="relative flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="relative w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shrink-0 shadow-sm">
                    <Sparkles className="w-5 h-5 text-primary-foreground" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-card" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-heading font-semibold text-foreground leading-tight truncate text-base">AI Assistant</h3>
                    <p className="text-[11px] text-muted-foreground leading-tight flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
                      {lang === "hi" ? <span className="font-hindi">पृष्ठ {currentPage}</span> : <>Page {currentPage}</>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <LangToggle />
                  <button
                    onClick={() => setOpen(false)}
                    className="w-10 h-10 rounded-full hover:bg-muted flex items-center justify-center transition-colors active:scale-95"
                    aria-label="Close"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {speakingState !== "idle" && (
              <div className="mx-3 sm:mx-4 mt-2 flex items-center gap-2 px-3 py-2 rounded-full bg-primary/10 border border-primary/20 animate-fade-in-fast shrink-0">
                <span className="relative flex w-2 h-2 shrink-0">
                  <span className={`absolute inset-0 rounded-full bg-primary ${speakingState === "speaking" ? "animate-ping" : ""}`} />
                  <span className="relative w-2 h-2 rounded-full bg-primary" />
                </span>
                <span className={`text-xs font-medium text-foreground flex-1 truncate ${lang === "hi" ? "font-hindi" : ""}`}>
                  {speakingState === "speaking"
                    ? (lang === "hi" ? "बोल रहा हूँ…" : "Speaking…")
                    : (lang === "hi" ? "रुका हुआ" : "Paused")}
                </span>
                {speakingState === "speaking" ? (
                  <button onClick={pauseSpeech} className="w-7 h-7 rounded-full bg-card hover:bg-muted flex items-center justify-center active:scale-95 transition-all" aria-label="Pause">
                    <Pause className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button onClick={resumeSpeech} className="w-7 h-7 rounded-full bg-card hover:bg-muted flex items-center justify-center active:scale-95 transition-all" aria-label="Resume">
                    <Play className="w-3.5 h-3.5" />
                  </button>
                )}
                <button onClick={stopSpeech} className="w-7 h-7 rounded-full bg-card hover:bg-muted flex items-center justify-center active:scale-95 transition-all" aria-label="Stop">
                  <Square className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
              <div className="px-3 sm:px-4 pt-3 shrink-0">
                <TabsList className="grid grid-cols-3 w-full h-11 p-1 bg-muted rounded-full">
                  <TabsTrigger value="ask" className="text-xs sm:text-sm gap-1.5 rounded-full data-[state=active]:shadow-sm">
                    <MessageCircle className="w-4 h-4" /> <span className="hidden xs:inline">Ask</span><span className="xs:hidden">Chat</span>
                  </TabsTrigger>
                  <TabsTrigger value="voice" className="text-xs sm:text-sm gap-1.5 rounded-full data-[state=active]:shadow-sm">
                    <Mic className="w-4 h-4" /> Voice
                  </TabsTrigger>
                  <TabsTrigger value="explain" className="text-xs sm:text-sm gap-1.5 rounded-full data-[state=active]:shadow-sm">
                    <BookOpen className="w-4 h-4" /> Explain
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* ASK */}
              <TabsContent value="ask" className="flex-1 flex flex-col min-h-0 m-0 px-3 sm:px-4 pb-3 sm:pb-4 pt-3 data-[state=inactive]:hidden">
                <div className="flex-1 overflow-y-auto space-y-4 mb-3 -mx-1 px-1 scroll-smooth overscroll-contain">
                  {messages.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center text-center px-4 py-6 mt-4 animate-fade-in">
                      <div className="relative w-20 h-20 mb-5">
                        <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping opacity-50" />
                        <div className="relative w-20 h-20 rounded-full bg-gradient-primary flex items-center justify-center shadow-pop">
                          <Sparkles className="w-9 h-9 text-primary-foreground" />
                        </div>
                      </div>
                      <h4 className={`text-lg font-heading font-semibold text-foreground mb-1.5 ${lang === "hi" ? "font-hindi" : ""}`}>
                        {lang === "hi" ? "नमस्ते! 👋" : "Hi there! 👋"}
                      </h4>
                      <p className={`text-sm text-muted-foreground mb-6 max-w-[260px] ${lang === "hi" ? "font-hindi" : ""}`}>
                        {lang === "hi" ? "इस PDF के बारे में कुछ भी पूछें, मैं मदद करूँगा।" : "Ask me anything about this PDF and I'll help you understand it."}
                      </p>
                      <div className="flex flex-col gap-2 w-full max-w-sm">
                        <p className={`text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1 ${lang === "hi" ? "font-hindi" : ""}`}>
                          {lang === "hi" ? "सुझाव" : "Try asking"}
                        </p>
                        {suggestions.map((s, i) => (
                          <button
                            key={s}
                            onClick={() => handleAsk(s)}
                            style={{ animationDelay: `${i * 60}ms` }}
                            className={`group text-left text-sm px-4 py-3 rounded-2xl bg-muted/60 border border-border/50 hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98] transition-all animate-fade-in flex items-center gap-3 ${lang === "hi" ? "font-hindi" : ""}`}
                          >
                            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                              <HelpCircle className="w-3.5 h-3.5 text-primary" />
                            </div>
                            <span className="flex-1 text-foreground">{s}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((m, i) => {
                    const isUser = m.role === "user";
                    const isLastAssistant = !isUser && i === messages.length - 1 && !loading;
                    return (
                      <div key={i} className={`flex gap-2 ${isUser ? "justify-end" : "justify-start"} animate-fade-in`}>
                        {!isUser && (
                          <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                            <Bot className="w-4 h-4 text-primary-foreground" />
                          </div>
                        )}
                        <div className={`max-w-[85%] sm:max-w-[80%] ${isUser ? "items-end" : "items-start"} flex flex-col gap-1.5 min-w-0`}>
                          <div className={`rounded-2xl px-4 py-2.5 ${
                            isUser
                              ? "bg-gradient-primary text-primary-foreground rounded-br-md shadow-sm"
                              : "bg-muted text-foreground rounded-bl-md"
                          } ${m.lang === "hi" ? "font-hindi" : ""}`}>
                            {isUser ? (
                              <p className={`whitespace-pre-wrap break-words text-[15px] leading-[1.5] ${m.lang === "hi" ? "leading-[1.7]" : ""}`}>{m.content}</p>
                            ) : (
                              <Markdown text={m.content} hindi={m.lang === "hi"} />
                            )}
                          </div>
                          {!isUser && (
                            <div className="flex items-center gap-1 px-1 flex-wrap">
                              <button
                                onClick={() => copyMsg(m.content, i)}
                                className="text-[11px] text-muted-foreground hover:text-foreground active:scale-95 flex items-center gap-1 px-2 py-1 rounded-full hover:bg-muted transition-all"
                              >
                                {copiedIdx === i ? <Check className="w-3 h-3 text-success" /> : <Copy className="w-3 h-3" />}
                                {copiedIdx === i ? "Copied" : "Copy"}
                              </button>
                              {speakingState !== "idle" && isLastAssistant ? (
                                <>
                                  {speakingState === "speaking" ? (
                                    <button
                                      onClick={pauseSpeech}
                                      className="text-[11px] text-primary hover:text-primary/80 active:scale-95 flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 hover:bg-primary/20 transition-all"
                                    >
                                      <Pause className="w-3 h-3" /> {lang === "hi" ? <span className="font-hindi">रोकें</span> : "Pause"}
                                    </button>
                                  ) : (
                                    <button
                                      onClick={resumeSpeech}
                                      className="text-[11px] text-primary hover:text-primary/80 active:scale-95 flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 hover:bg-primary/20 transition-all"
                                    >
                                      <Play className="w-3 h-3" /> {lang === "hi" ? <span className="font-hindi">जारी</span> : "Resume"}
                                    </button>
                                  )}
                                  <button
                                    onClick={stopSpeech}
                                    className="text-[11px] text-muted-foreground hover:text-foreground active:scale-95 flex items-center gap-1 px-2 py-1 rounded-full hover:bg-muted transition-all"
                                  >
                                    <Square className="w-3 h-3" /> {lang === "hi" ? <span className="font-hindi">बंद</span> : "Stop"}
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => speak(m.content, m.lang)}
                                  className="text-[11px] text-muted-foreground hover:text-foreground active:scale-95 flex items-center gap-1 px-2 py-1 rounded-full hover:bg-muted transition-all"
                                >
                                  <Volume2 className="w-3 h-3" /> {lang === "hi" ? <span className="font-hindi">सुनें</span> : "Speak"}
                                </button>
                              )}
                              {isLastAssistant && (
                                <button
                                  onClick={regenerate}
                                  className="text-[11px] text-muted-foreground hover:text-foreground active:scale-95 flex items-center gap-1 px-2 py-1 rounded-full hover:bg-muted transition-all"
                                >
                                  <RotateCcw className="w-3 h-3" /> Retry
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {loading && (
                    <div className="flex gap-2 justify-start animate-fade-in-fast">
                      <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                        <Bot className="w-4 h-4 text-primary-foreground" />
                      </div>
                      <div className={`max-w-[85%] bg-muted rounded-2xl rounded-bl-md px-4 py-2.5 ${lang === "hi" ? "font-hindi" : ""}`}>
                        {streamingText ? (
                          <div className="flex items-baseline">
                            <Markdown text={streamingText} hindi={lang === "hi"} />
                            <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-primary/70 animate-pulse rounded-sm" />
                          </div>
                        ) : (
                          <TypingDots />
                        )}
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {interim && (
                  <div className={`text-sm italic text-primary mb-2 px-3 py-2 bg-primary/5 rounded-xl border border-primary/20 flex items-center gap-2 animate-fade-in-fast ${lang === "hi" ? "font-hindi" : ""}`}>
                    <Mic className="w-3.5 h-3.5 shrink-0 animate-pulse" />
                    <span className="truncate">{interim}</span>
                  </div>
                )}

                <form
                  onSubmit={(e) => { e.preventDefault(); handleAsk(); }}
                  className="flex gap-2 items-end bg-muted/50 border border-border/60 rounded-2xl p-1.5 focus-within:border-primary/50 focus-within:bg-card transition-all"
                >
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAsk();
                      }
                    }}
                    placeholder={lang === "hi" ? "अपना प्रश्न लिखें…" : "Type your question…"}
                    rows={1}
                    className={`flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground max-h-[120px] min-h-[40px] ${lang === "hi" ? "font-hindi" : ""}`}
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={listening ? stopListening : startListening}
                    disabled={loading}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-95 ${listening ? "bg-destructive text-destructive-foreground animate-pulse" : "text-muted-foreground hover:text-primary hover:bg-primary/10"}`}
                    aria-label="Voice input"
                  >
                    {listening ? <MicOff className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
                  </button>
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gradient-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 active:scale-95 transition-all"
                    aria-label="Send"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
                </form>
              </TabsContent>

              {/* VOICE */}
              <TabsContent value="voice" className="flex-1 flex flex-col items-center m-0 px-4 pb-4 pt-4 overflow-y-auto data-[state=inactive]:hidden">
                {lang === "hi" && voicesReady && !hindiVoiceAvailable && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4 font-hindi max-w-xs text-center">
                    हिन्दी आवाज़ इस डिवाइस पर उपलब्ध नहीं है।
                  </div>
                )}

                <div className="flex-1 flex flex-col items-center justify-center w-full">
                  {/* Voice orb */}
                  <div className="relative w-44 h-44 mb-6 flex items-center justify-center">
                    {(listening || speakingState === "speaking") && (
                      <>
                        <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                        <span className="absolute inset-3 rounded-full bg-primary/30 animate-ping" style={{ animationDelay: "200ms" }} />
                        <span className="absolute inset-6 rounded-full bg-primary/40 animate-ping" style={{ animationDelay: "400ms" }} />
                      </>
                    )}
                    <button
                      onClick={listening ? stopListening : (loading ? undefined : startListening)}
                      disabled={loading}
                      className={`relative w-32 h-32 rounded-full flex items-center justify-center shadow-pop transition-all active:scale-95 ${
                        listening ? "bg-destructive scale-105" :
                        speakingState === "speaking" ? "bg-gradient-primary scale-105" :
                        "bg-gradient-primary hover:scale-105"
                      }`}
                      aria-label={listening ? "Stop listening" : "Start listening"}
                    >
                      {loading ? <Loader2 className="w-12 h-12 text-primary-foreground animate-spin" /> :
                       listening ? <MicOff className="w-12 h-12 text-primary-foreground" /> :
                       speakingState === "speaking" ? <Volume2 className="w-12 h-12 text-primary-foreground" /> :
                       <Mic className="w-12 h-12 text-primary-foreground" />}
                    </button>
                  </div>

                  <p className={`text-lg font-semibold text-foreground mb-1 ${lang === "hi" ? "font-hindi" : ""}`}>
                    {lang === "hi" ? (
                      listening ? "सुन रहा हूँ…" :
                      loading ? "सोच रहा है…" :
                      speakingState === "speaking" ? "बोल रहा हूँ" :
                      "बोलें"
                    ) : (
                      listening ? "Listening…" :
                      loading ? "Thinking…" :
                      speakingState === "speaking" ? "Speaking" :
                      "Tap to speak"
                    )}
                  </p>
                  <p className={`text-sm text-muted-foreground mb-4 max-w-xs text-center ${lang === "hi" ? "font-hindi" : ""}`}>
                    {lang === "hi" ? "PDF के बारे में अपना प्रश्न ज़ोर से बोलें" : "Ask your question out loud about the PDF"}
                  </p>

                  {interim && (
                    <p className={`text-sm italic text-primary mb-3 max-w-xs px-4 py-2 bg-primary/5 rounded-full border border-primary/20 ${lang === "hi" ? "font-hindi" : ""}`}>
                      "{interim}"
                    </p>
                  )}

                  <div className="flex gap-2 mt-2 flex-wrap justify-center">
                    {speakingState === "speaking" && (
                      <Button variant="outline" size="sm" onClick={pauseSpeech} className="rounded-full">
                        <Pause className="w-4 h-4 mr-1" /> Pause
                      </Button>
                    )}
                    {speakingState === "paused" && (
                      <Button variant="outline" size="sm" onClick={resumeSpeech} className="rounded-full">
                        <Play className="w-4 h-4 mr-1" /> Resume
                      </Button>
                    )}
                    {speakingState !== "idle" && (
                      <Button variant="outline" size="sm" onClick={stopSpeech} className="rounded-full">
                        <Square className="w-4 h-4 mr-1" /> Stop
                      </Button>
                    )}
                  </div>
                </div>

                {messages.length > 0 && messages[messages.length - 1].role === "assistant" && (
                  <div className={`mt-4 text-left bg-muted/60 rounded-2xl p-4 w-full max-h-44 overflow-y-auto border border-border/50 ${messages[messages.length - 1].lang === "hi" ? "font-hindi" : ""}`}>
                    <div className="flex items-center justify-between mb-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                      <span>{messages[messages.length - 1].lang === "hi" ? "उत्तर" : "Answer"}</span>
                      <button
                        onClick={() => speak(messages[messages.length - 1].content, messages[messages.length - 1].lang)}
                        className="text-primary hover:text-primary/80 flex items-center gap-1 normal-case tracking-normal"
                      >
                        <Volume2 className="w-3 h-3" /> Replay
                      </button>
                    </div>
                    <Markdown text={messages[messages.length - 1].content} hindi={messages[messages.length - 1].lang === "hi"} />
                  </div>
                )}
              </TabsContent>

              {/* EXPLAIN */}
              <TabsContent value="explain" className="flex-1 flex flex-col m-0 px-3 sm:px-4 pb-3 sm:pb-4 pt-3 min-h-0 data-[state=inactive]:hidden">
                <div className="flex items-center justify-between mb-3 px-1 gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <BookOpen className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground leading-tight truncate">
                        {lang === "hi" ? <span className="font-hindi">पृष्ठ {currentPage}</span> : <>Page {currentPage}</>}
                      </p>
                      <p className={`text-[11px] text-muted-foreground leading-tight ${lang === "hi" ? "font-hindi" : ""}`}>
                        {lang === "hi" ? "सरल व्याख्या" : "Simple explanation"}
                      </p>
                    </div>
                  </div>
                  <Button onClick={handleExplain} disabled={explainLoading} size="sm" className="rounded-full bg-gradient-primary shrink-0">
                    {explainLoading ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> <span className={lang === "hi" ? "font-hindi" : ""}>{lang === "hi" ? "पढ़ रहा है…" : "Reading…"}</span></>
                    ) : (
                      <><Sparkles className="w-3.5 h-3.5 mr-1.5" /><span className={lang === "hi" ? "font-hindi" : ""}>{lang === "hi" ? "समझाएँ" : "Explain"}</span></>
                    )}
                  </Button>
                </div>

                <div className={`flex-1 overflow-y-auto bg-muted/40 border border-border/50 rounded-2xl p-4 ${explanation && explanationLang === "hi" ? "font-hindi" : ""}`}>
                  {explanation ? (
                    <>
                      <Markdown text={explanation} hindi={explanationLang === "hi"} />
                      {explainLoading && <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-primary/70 animate-pulse rounded-sm" />}
                    </>
                  ) : explainLoading ? (
                    <div className="space-y-2.5">
                      <div className="h-3 skeleton rounded w-3/4" />
                      <div className="h-3 skeleton rounded w-full" />
                      <div className="h-3 skeleton rounded w-5/6" />
                      <div className="h-3 skeleton rounded w-2/3" />
                      <div className="h-3 skeleton rounded w-4/5" />
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center h-full py-8">
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <BookOpen className="w-7 h-7 text-primary" />
                      </div>
                      <p className={`font-semibold text-foreground mb-1.5 ${lang === "hi" ? "font-hindi" : ""}`}>
                        {lang === "hi" ? "तैयार हैं?" : "Ready to learn?"}
                      </p>
                      <p className={`text-sm text-muted-foreground max-w-xs ${lang === "hi" ? "font-hindi" : ""}`}>
                        {lang === "hi"
                          ? "वर्तमान पृष्ठ की सरल व्याख्या पाने के लिए ऊपर “समझाएँ” दबाएँ।"
                          : "Tap “Explain” for a friendly walkthrough of the current page — read aloud automatically."}
                      </p>
                    </div>
                  )}
                </div>

                {explanation && !explainLoading && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {speakingState === "speaking" && <Button size="sm" variant="outline" onClick={pauseSpeech} className="rounded-full"><Pause className="w-4 h-4 mr-1" /> Pause</Button>}
                    {speakingState === "paused" && <Button size="sm" variant="outline" onClick={resumeSpeech} className="rounded-full"><Play className="w-4 h-4 mr-1" /> Resume</Button>}
                    {speakingState !== "idle" && <Button size="sm" variant="outline" onClick={stopSpeech} className="rounded-full"><Square className="w-4 h-4 mr-1" /> Stop</Button>}
                    {speakingState === "idle" && <Button size="sm" variant="outline" onClick={() => speak(explanation, explanationLang)} className="rounded-full"><Volume2 className="w-4 h-4 mr-1" /> Read Again</Button>}
                    <Button size="sm" variant="outline" onClick={() => copyMsg(explanation, -1)} className="rounded-full">
                      {copiedIdx === -1 ? <><Check className="w-4 h-4 mr-1 text-success" /> Copied</> : <><Copy className="w-4 h-4 mr-1" /> Copy</>}
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </>
      )}
    </>
  );
}
