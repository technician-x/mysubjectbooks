import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Sparkles, X, Send, Mic, MicOff, Volume2, Pause, Play, Square, Loader2, MessageCircle, BookOpen, HelpCircle } from "lucide-react";
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

// Split long text into natural sentence-sized chunks (helps mobile TTS engines)
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
  const [lang, setLang] = useState<Lang>("en");

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const recogRef = useRef<any>(null);

  const [speakingState, setSpeakingState] = useState<"idle" | "speaking" | "paused">("idle");
  const speakQueueRef = useRef<SpeechSynthesisUtterance[]>([]);

  const [explanation, setExplanation] = useState("");
  const [explanationLang, setExplanationLang] = useState<Lang>("en");
  const [explainLoading, setExplainLoading] = useState(false);

  const [voicesReady, setVoicesReady] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, streamingText]);

  // Warm up voice list (some browsers load asynchronously)
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
    if (!voicesReady || !("speechSynthesis" in window)) return true; // assume ok before checking
    const v = window.speechSynthesis.getVoices();
    return v.some((x) => x.lang?.toLowerCase().startsWith("hi"));
  }, [voicesReady]);

  // Pick the best Hindi voice (Google / Microsoft natural voices preferred)
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

  // Stream from edge function via SSE
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
          if (delta) {
            full += delta;
            onDelta(delta);
          }
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

  // Queued chunked speech for natural Hindi delivery
  const speak = (text: string, speakLang: Lang = lang) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    speakQueueRef.current = [];

    const voice = findVoice(speakLang);
    if (speakLang === "hi" && !voice) {
      toast.warning("Hindi voice not installed on this device. Install a Hindi TTS voice in your OS settings for best results.");
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
      u.onend = () => {
        if (i === chunks.length - 1) setSpeakingState("idle");
      };
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

    recog.onresult = (e: any) => {
      let finalTxt = "";
      let interimTxt = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalTxt += r[0].transcript;
        else interimTxt += r[0].transcript;
      }
      if (interimTxt) setInterim(interimTxt);
      if (finalTxt) {
        setInterim("");
        setListening(false);
        try { recog.stop(); } catch { /* noop */ }
        handleAsk(finalTxt);
      }
    };
    recog.onerror = (e: any) => {
      setListening(false);
      setInterim("");
      if (e.error === "no-speech") toast.info(lang === "hi" ? "कोई आवाज़ नहीं सुनाई दी" : "No speech detected");
      else if (e.error === "not-allowed") toast.error("Microphone permission denied");
    };
    recog.onend = () => { setListening(false); setInterim(""); };
    recog.start();
    recogRef.current = recog;
    setListening(true);
  };

  const stopListening = () => { try { recogRef.current?.stop(); } catch { /* noop */ } setListening(false); };

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
    <div className="flex gap-1 p-1 bg-muted rounded-full mb-4 self-center">
      <button
        onClick={() => setLang("en")}
        className={`px-3 py-1.5 text-xs font-medium rounded-full transition-smooth ${lang === "en" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
      >
        🇬🇧 English
      </button>
      <button
        onClick={() => setLang("hi")}
        className={`px-3 py-1.5 text-xs font-medium rounded-full transition-smooth ${lang === "hi" ? "bg-primary text-primary-foreground shadow-sm font-hindi" : "text-muted-foreground hover:text-foreground font-hindi"}`}
      >
        🇮🇳 हिन्दी
      </button>
    </div>
  );

  const TypingDots = () => (
    <div className="flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "0ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "150ms" }} />
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: "300ms" }} />
    </div>
  );

  const suggestions = lang === "hi"
    ? ["इस पृष्ठ का सारांश दें", "मुख्य बिंदु क्या हैं?", "इसे सरल शब्दों में समझाएँ"]
    : ["Summarize this page", "What are the key points?", "Explain this simply"];

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-primary text-primary-foreground shadow-pop hover:scale-110 active:scale-95 transition-all flex items-center justify-center"
          aria-label="Open AI Assistant"
        >
          <Sparkles className="w-6 h-6 sm:w-7 sm:h-7" />
        </button>
      )}

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 sm:bg-transparent sm:pointer-events-none animate-fade-in-fast"
            onClick={() => setOpen(false)}
          />

          <div
            className="fixed z-50 bg-card flex flex-col overflow-hidden shadow-pop
                       inset-x-0 bottom-0 h-[85vh] rounded-t-2xl animate-slide-in-bottom
                       sm:inset-y-0 sm:right-0 sm:left-auto sm:top-0 sm:bottom-0 sm:h-full sm:w-[420px] sm:rounded-none sm:rounded-l-2xl sm:animate-slide-in-right"
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-gradient-primary flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-primary-foreground" />
                </div>
                <h3 className="font-heading font-semibold text-foreground">AI Assistant</h3>
              </div>
              <button onClick={() => setOpen(false)} className="w-10 h-10 rounded-full hover:bg-muted flex items-center justify-center" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
              <div className="px-4 pt-4">
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="ask">Ask</TabsTrigger>
                  <TabsTrigger value="voice">Voice</TabsTrigger>
                  <TabsTrigger value="explain">Explain</TabsTrigger>
                </TabsList>
              </div>

              {/* ASK */}
              <TabsContent value="ask" className="flex-1 flex flex-col min-h-0 m-0 px-4 pb-4 pt-3">
                <LangToggle />
                <div className="flex-1 overflow-y-auto space-y-3 mb-3 -mx-1 px-1">
                  {messages.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center text-center px-6 py-8 mt-4 animate-fade-in-fast">
                      <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <MessageCircle className="w-6 h-6 text-primary" />
                      </div>
                      <h4 className={`font-heading font-semibold text-foreground mb-1 ${lang === "hi" ? "font-hindi" : ""}`}>
                        {lang === "hi" ? "नमस्ते! मैं आपकी मदद के लिए तैयार हूँ" : "Hi! How can I help?"}
                      </h4>
                      <p className={`text-sm text-muted-foreground mb-5 ${lang === "hi" ? "font-hindi" : ""}`}>
                        {lang === "hi" ? "इस PDF के बारे में कुछ भी पूछें" : "Ask anything about this PDF"}
                      </p>
                      <div className="flex flex-col gap-2 w-full max-w-xs">
                        {suggestions.map((s) => (
                          <button
                            key={s}
                            onClick={() => handleAsk(s)}
                            className={`text-left text-sm px-3 py-2 rounded-xl bg-muted hover:bg-muted/70 transition-smooth ${lang === "hi" ? "font-hindi" : ""}`}
                          >
                            <HelpCircle className="w-3.5 h-3.5 inline mr-2 text-primary" />
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-fade-in-fast`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                        m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                      } ${m.lang === "hi" ? "font-hindi" : ""}`}>
                        <div className="text-[10px] opacity-70 mb-1">
                          {m.lang === "hi" ? "🇮🇳 हिन्दी" : "🇬🇧 English"}
                        </div>
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start animate-fade-in-fast">
                      <div className={`max-w-[85%] bg-muted rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap text-foreground ${lang === "hi" ? "font-hindi" : ""}`}>
                        <div className="text-[10px] opacity-70 mb-1">
                          {lang === "hi" ? "🇮🇳 हिन्दी" : "🇬🇧 English"}
                        </div>
                        {streamingText ? (
                          <>
                            {streamingText}
                            <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-primary/70 animate-pulse" />
                          </>
                        ) : (
                          <TypingDots />
                        )}
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
                <form onSubmit={(e) => { e.preventDefault(); handleAsk(); }} className="flex gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={lang === "hi" ? "इस PDF के बारे में पूछें…" : "Ask about this PDF…"}
                    className={lang === "hi" ? "font-hindi" : ""}
                    disabled={loading}
                  />
                  <Button type="submit" size="icon" disabled={loading || !input.trim()}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </form>
              </TabsContent>

              {/* VOICE */}
              <TabsContent value="voice" className="flex-1 flex flex-col items-center justify-center m-0 p-6 text-center">
                <LangToggle />
                {lang === "hi" && voicesReady && !hindiVoiceAvailable && (
                  <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4 font-hindi">
                    हिन्दी आवाज़ इस डिवाइस पर उपलब्ध नहीं है। कृपया सेटिंग्स में हिन्दी TTS स्थापित करें।
                  </div>
                )}
                <div className={`w-32 h-32 rounded-full bg-gradient-primary flex items-center justify-center mb-6 transition-transform ${listening ? "animate-pulse scale-110" : speakingState === "speaking" ? "animate-pulse" : ""}`}>
                  {listening ? <MicOff className="w-12 h-12 text-primary-foreground" /> :
                   speakingState === "speaking" ? <Volume2 className="w-12 h-12 text-primary-foreground" /> :
                   <Mic className="w-12 h-12 text-primary-foreground" />}
                </div>
                <p className={`text-sm text-muted-foreground mb-2 ${lang === "hi" ? "font-hindi" : ""}`}>
                  {lang === "hi" ? (
                    listening ? "सुन रहा हूँ… अब बोलें" :
                    loading ? "सोच रहा है…" :
                    speakingState === "speaking" ? "उत्तर बोला जा रहा है" :
                    "टैप करें और प्रश्न पूछें"
                  ) : (
                    listening ? "Listening… speak now" :
                    loading ? "Thinking…" :
                    speakingState === "speaking" ? "Speaking the answer" :
                    "Tap and ask a question out loud"
                  )}
                </p>
                {interim && (
                  <p className={`text-xs italic text-primary mb-3 max-w-xs ${lang === "hi" ? "font-hindi" : ""}`}>
                    "{interim}"
                  </p>
                )}
                <div className="flex gap-2 mt-2">
                  {!listening ? (
                    <Button onClick={startListening} disabled={loading} size="lg">
                      <Mic className="w-4 h-4 mr-2" />
                      <span className={lang === "hi" ? "font-hindi" : ""}>
                        {lang === "hi" ? "बोलें" : "Start Listening"}
                      </span>
                    </Button>
                  ) : (
                    <Button variant="destructive" onClick={stopListening} size="lg">
                      <MicOff className="w-4 h-4 mr-2" />
                      <span className={lang === "hi" ? "font-hindi" : ""}>{lang === "hi" ? "रोकें" : "Stop"}</span>
                    </Button>
                  )}
                  {speakingState !== "idle" && (
                    <Button variant="outline" size="lg" onClick={stopSpeech}>
                      <Square className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {messages.length > 0 && (
                  <div className={`mt-6 text-left text-sm bg-muted rounded-card p-3 w-full max-h-32 overflow-y-auto ${messages[messages.length - 1].lang === "hi" ? "font-hindi" : ""}`}>
                    <div className="text-[10px] opacity-70 mb-1">
                      {messages[messages.length - 1].lang === "hi" ? "🇮🇳 हिन्दी" : "🇬🇧 English"}
                    </div>
                    {messages[messages.length - 1].content}
                  </div>
                )}
              </TabsContent>

              {/* EXPLAIN */}
              <TabsContent value="explain" className="flex-1 flex flex-col m-0 px-4 pb-4 pt-3 min-h-0">
                <LangToggle />
                <Button onClick={handleExplain} disabled={explainLoading} className="mb-3" size="lg">
                  {explainLoading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> <span className={lang === "hi" ? "font-hindi" : ""}>{lang === "hi" ? `पृष्ठ ${currentPage} पढ़ रहा है…` : `Reading page ${currentPage}…`}</span></>
                  ) : (
                    <span className={lang === "hi" ? "font-hindi" : ""}>{lang === "hi" ? `पृष्ठ ${currentPage} समझाएँ` : `Explain Page ${currentPage}`}</span>
                  )}
                </Button>
                <div className={`flex-1 overflow-y-auto bg-muted rounded-card p-4 text-sm whitespace-pre-wrap ${explanation && explanationLang === "hi" ? "font-hindi" : ""}`}>
                  {explanation ? (
                    <>
                      {explanation}
                      {explainLoading && <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-primary/70 animate-pulse" />}
                    </>
                  ) : explainLoading ? (
                    <TypingDots />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center h-full py-8">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                        <BookOpen className="w-5 h-5 text-primary" />
                      </div>
                      <span className={`text-muted-foreground ${lang === "hi" ? "font-hindi" : ""}`}>
                        {lang === "hi"
                          ? "वर्तमान पृष्ठ की सरल व्याख्या पाने के लिए ऊपर क्लिक करें।"
                          : "Click above to get a simple explanation of the current page, read aloud automatically."}
                      </span>
                    </div>
                  )}
                </div>
                {explanation && !explainLoading && (
                  <div className="flex gap-2 mt-3">
                    {speakingState === "speaking" && <Button size="sm" variant="outline" onClick={pauseSpeech}><Pause className="w-4 h-4 mr-1" /> Pause</Button>}
                    {speakingState === "paused" && <Button size="sm" variant="outline" onClick={resumeSpeech}><Play className="w-4 h-4 mr-1" /> Resume</Button>}
                    {speakingState !== "idle" && <Button size="sm" variant="outline" onClick={stopSpeech}><Square className="w-4 h-4 mr-1" /> Stop</Button>}
                    {speakingState === "idle" && <Button size="sm" variant="outline" onClick={() => speak(explanation, explanationLang)}><Volume2 className="w-4 h-4 mr-1" /> Read Again</Button>}
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
