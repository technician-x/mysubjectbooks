const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { mode, question, pdfText, pageNumber, language, stream } = await req.json();
    const isHindi = language === "hi";
    const wantStream = stream !== false; // default true
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    let systemPrompt = "";
    let userPrompt = "";

    if (mode === "explain") {
      systemPrompt = isHindi
        ? "आप एक मित्रवत शिक्षक हैं जो छात्रों को सरल हिन्दी (देवनागरी लिपि) में समझाते हैं। केवल शुद्ध हिन्दी का प्रयोग करें — अंग्रेज़ी शब्दों से बचें जब तक आवश्यक न हो। छोटे, स्पष्ट वाक्यों में बोलें ताकि उत्तर ज़ोर से पढ़ने पर भी प्राकृतिक लगे। मार्कडाउन, स्टार (*), या विशेष चिह्नों का उपयोग न करें। केवल दिए गए PDF पाठ पर आधारित उत्तर दें।"
        : "You are a friendly teacher explaining content to a school/college student. Use simple, clear language and short paragraphs. Avoid markdown symbols, asterisks, or special characters since the answer may be read aloud. Keep explanations concise but thorough.";
      userPrompt = `${isHindi ? `पृष्ठ ${pageNumber ?? ""} की निम्नलिखित सामग्री को सरल हिन्दी में समझाएँ` : `Explain the following content from page ${pageNumber ?? ""} in simple language a student can understand`}:\n\n${pdfText}`;
    } else {
      systemPrompt = isHindi
        ? "आप एक AI अध्ययन सहायक हैं जो छात्र को PDF समझने में मदद करते हैं। उत्तर सदैव शुद्ध, सरल हिन्दी (देवनागरी लिपि) में दें — अंग्रेज़ी मिश्रण से बचें। छोटे, स्वाभाविक वाक्यों में लिखें क्योंकि उत्तर ज़ोर से पढ़ा जा सकता है। मार्कडाउन, स्टार (*), या विशेष चिह्नों का उपयोग न करें। केवल दिए गए PDF पाठ पर आधारित उत्तर दें। यदि उत्तर किसी विशेष पृष्ठ पर हो, अंत में 'पृष्ठ संदर्भ: पृष्ठ X' लिखें। यदि उत्तर ज्ञात न हो, ईमानदारी से कहें।"
        : "You are an AI Study Assistant helping a student understand a PDF document. Answer questions clearly and concisely based on the provided PDF content. Avoid markdown symbols or asterisks since answers may be read aloud. If the answer is on a specific page, mention 'Page reference: Page X' at the end. If you don't know, say so honestly.";
      userPrompt = `${isHindi ? "PDF सामग्री" : "PDF Content"}:\n${pdfText}\n\n${isHindi ? "छात्र का प्रश्न" : "Student Question"}: ${question}`;
    }

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        stream: wantStream,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!upstream.ok) {
      if (upstream.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (upstream.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in workspace settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await upstream.text();
      console.error("AI error", upstream.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!wantStream) {
      const data = await upstream.json();
      const answer = data.choices?.[0]?.message?.content ?? "No answer available.";
      return new Response(JSON.stringify({ answer }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pipe SSE stream through to client
    return new Response(upstream.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (e) {
    console.error("pdf-ai error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
