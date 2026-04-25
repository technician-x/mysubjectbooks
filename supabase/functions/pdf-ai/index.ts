const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { mode, question, pdfText, pageNumber, language } = await req.json();
    const isHindi = language === "hi";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let systemPrompt = "";
    let userPrompt = "";

    if (mode === "explain") {
      systemPrompt = isHindi
        ? "Explain the following content in simple Hindi (Devanagari script) as if you are a teacher explaining to a student. Use easy language suitable for school or college students. Base your answer only on the provided PDF content."
        : "You are a friendly teacher explaining content to a school/college student. Use simple, clear language. Keep explanations concise but thorough. Use short paragraphs.";
      userPrompt = `Explain the following content from page ${pageNumber ?? ""}${isHindi ? " in simple Hindi" : " in simple language a student can understand"}:\n\n${pdfText}`;
    } else {
      systemPrompt = isHindi
        ? "You are an AI Study Assistant helping a student understand a PDF document. The student has asked a question in Hindi. Please answer in clear, simple Hindi (Devanagari script). Use easy language suitable for school or college students. Base your answer only on the provided PDF content. If the answer is on a specific page, mention 'पृष्ठ संदर्भ: पृष्ठ X' at the end. If you don't know, say so honestly."
        : "You are an AI Study Assistant helping a student understand a PDF document. Answer questions clearly and concisely based on the provided PDF content. If the answer is on a specific page, mention 'Page reference: Page X' at the end. If you don't know, say so honestly.";
      userPrompt = `PDF Content:\n${pdfText}\n\nStudent Question: ${question}`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in workspace settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content ?? "No answer available.";

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("pdf-ai error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
