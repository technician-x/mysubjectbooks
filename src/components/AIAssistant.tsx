import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Sparkles, X, Send, Mic, MicOff, Volume2, Pause, Play, Square, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Lang = "en" | "hi";
type Msg = { role: "user" | "assistant"; content: string; lang: Lang };

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [listening, setListening] = useState(false);
  const recogRef = useRef<any>(null);

  const [speakingState, setSpeakingState] = useState<"idle" | "speaking" | "paused">("idle");

  const [explanation, setExplanation] = useState("");
  const [explanationLang, setExplanationLang] = useState<Lang>("en");
  const [explainLoading, setExplainLoading] = useState(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);

  const callAI = async (mode: "ask" | "explain", question?: string) => {
    const text = mode === "explain"
      ? (pageTexts[currentPage] || pdfText.slice(0, 8000))
      : pdfText.slice(0, 12000);
    const { data, error } = await supabase.functions.invoke("pdf-ai", {
      body: { mode, question, pdfText: text, pageNumber: currentPage, language: lang },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data.answer as string;
  };

  const handleAsk = async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question) return;
    const askLang = lang;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: question, lang: askLang }]);
    setLoading(true);
    try {
      const answer = await callAI("ask", question);
      setMessages((m) => [...m, { role: "assistant", content: answer, lang: askLang }]);
      if (tab === "voice") speak(answer, askLang);
    } catch (e: any) {
      toast.error(e.message || "Failed to get answer");
    } finally {
      setLoading(false);
    }
  };

  const findVoice = (target: Lang): SpeechSynthesisVoice | null => {
    if (!("speechSynthesis" in window)) return null;
    const voices = window.speechSynthesis.getVoices();
    if (target === "hi") {
      return voices.find((v) => v.lang === "hi-IN") || voices.find((v) => v.lang?.toLowerCase().startsWith("hi")) || null;
    }
    return voices.find((v) => v.lang?.toLowerCase().startsWith("en")) || null;
  };

  const speak = (text: string, speakLang: Lang = lang) => {
    if (!("speechSynthesis" in window)) return;
    if (speakLang === "hi") {
      const hindiVoice = findVoice("hi");
      if (!hindiVoice) {
        toast.warning("Hindi voice not available on your device. Showing text answer instead.");
        return;
      }
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.voice = hindiVoice;
      utter.lang = "hi-IN";
      utter.rate = 0.95;
      utter.onend = () => setSpeakingState("idle");
      utter.onerror = () => setSpeakingState("idle");
      window.speechSynthesis.speak(utter);
      setSpeakingState("speaking");
      return;
    }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const enVoice = findVoice("en");
    if (enVoice) utter.voice = enVoice;
    utter.lang = "en-US";
    utter.rate = 1;
    utter.onend = () => setSpeakingState("idle");
    utter.onerror = () => setSpeakingState("idle");
    window.speechSynthesis.speak(utter);
    setSpeakingState("speaking");
  };

  const pauseSpeech = () => { window.speechSynthesis.pause(); setSpeakingState("paused"); };
  const resumeSpeech = () => { window.speechSynthesis.resume(); setSpeakingState("speaking"); };
  const stopSpeech = () => { window.speechSynthesis.cancel(); setSpeakingState("idle"); };

  const startListening = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("Voice input not supported in this browser"); return; }
    const recog = new SR();
    recog.lang = lang === "hi" ? "hi-IN" : "en-US";
    recog.interimResults = false;
    recog.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      setListening(false);
      handleAsk(transcript);
    };
    recog.onerror = () => setListening(false);
    recog.onend = () => setListening(false);
    recog.start();
    recogRef.current = recog;
    setListening(true);
  };

  const stopListening = () => { recogRef.current?.stop(); setListening(false); };

  const handleExplain = async () => {
    setExplainLoading(true);
    setExplanation("");
    const explainLang = lang;
    setExplanationLang(explainLang);
    try {
      const ans = await callAI("explain");
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
          {/* Backdrop on mobile */}
          <div
            className="fixed inset-0 z-40 bg-black/30 sm:bg-transparent sm:pointer-events-none animate-fade-in-fast"
            onClick={() => setOpen(false)}
          />

          {/* Panel: bottom-sheet on mobile, right-slide on desktop */}
          <div
            className="fixed z-50 bg-card flex flex-col overflow-hidden shadow-pop
                       inset-x-0 bottom-0 h-[85vh] rounded-t-2xl animate-slide-in-bottom
                       sm:inset-y-0 sm:right-0 sm:left-auto sm:top-0 sm:bottom-0 sm:h-full sm:w-[420px] sm:rounded-none sm:rounded-l-2xl sm:animate-slide-in-right"
          >
            {/* Header */}
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
                  {messages.length === 0 && (
                    <div className="text-center text-sm text-muted-foreground mt-12 px-4">
                      {lang === "hi"
                        ? <span className="font-hindi">इस PDF के बारे में कुछ भी पूछें</span>
                        : "Ask anything about this PDF."}
                    </div>
                  )}
                  {messages.map((m, i) => (
                    <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
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
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl px-4 py-2.5 text-sm flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {lang === "hi" ? <span className="font-hindi">सोच रहा है…</span> : "Thinking…"}
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
                  />
                  <Button type="submit" size="icon" disabled={loading}><Send className="w-4 h-4" /></Button>
                </form>
              </TabsContent>

              {/* VOICE */}
              <TabsContent value="voice" className="flex-1 flex flex-col items-center justify-center m-0 p-6 text-center">
                <LangToggle />
                <div className={`w-32 h-32 rounded-full bg-gradient-primary flex items-center justify-center mb-6 ${listening || speakingState === "speaking" ? "animate-pulse" : ""}`}>
                  {listening ? <MicOff className="w-12 h-12 text-primary-foreground" /> :
                   speakingState === "speaking" ? <Volume2 className="w-12 h-12 text-primary-foreground" /> :
                   <Mic className="w-12 h-12 text-primary-foreground" />}
                </div>
                <p className={`text-sm text-muted-foreground mb-4 ${lang === "hi" ? "font-hindi" : ""}`}>
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
                <div className="flex gap-2">
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
                  {explanation || (
                    <span className={`text-muted-foreground ${lang === "hi" ? "font-hindi" : ""}`}>
                      {lang === "hi"
                        ? "वर्तमान पृष्ठ की सरल व्याख्या पाने के लिए ऊपर क्लिक करें।"
                        : "Click above to get a simple explanation of the current page, read aloud automatically."}
                    </span>
                  )}
                </div>
                {explanation && (
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
