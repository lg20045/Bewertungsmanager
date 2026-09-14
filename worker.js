export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API endpoint for the BewertungsManager frontend.
    if (url.pathname === "/api/generate") {
      if (request.method !== "POST") {
        return json({ error: "Methode nicht erlaubt." }, 405);
      }

      try {
        const body = await request.json();
        const review = String(body.review || "").trim();
        const company = String(body.company || "").trim() || "nicht angegeben";
        const industry = String(body.industry || "Andere").trim();
        const tone = String(body.tone || "Professionell").trim();
        const details = String(body.details || "").trim() || "keine";
        const extra = String(body.extra || "").trim();

        if (!review) {
          return json({ error: "Bitte zuerst eine Bewertung eingeben." }, 400);
        }

        if (!env.GEMINI_API_KEY) {
          return json({ error: "GEMINI_API_KEY ist im Cloudflare Worker noch nicht hinterlegt." }, 500);
        }

        const prompt = `Du bist der Antwortassistent für ein Unternehmen. Schreibe eine natürliche, individuelle Antwort auf die Kundenbewertung.

Regeln:
- Antworte auf Deutsch.
- Passe die Antwort exakt an den Inhalt der Bewertung an.
- Wenn die Bewertung gemischt ist, erwähne sowohl das Positive als auch die konkrete Kritik.
- Bei Kritik: verständnisvoll, sachlich und lösungsorientiert reagieren, ohne Schuldzuweisungen.
- Keine Fakten, Maßnahmen, Angebote, Versprechen, Gründe oder Entschuldigungen erfinden.
- Keine Namen erfinden.
- Keine rechtlichen Behauptungen.
- Keine KI-Floskeln wie "Vielen Dank für Ihr wertvolles Feedback" oder "Ihre Zufriedenheit steht für uns an erster Stelle".
- Beginne nicht automatisch mit "Es freut uns sehr".
- Bei sehr kurzen Bewertungen 1-2 natürliche Sätze; sonst ungefähr 2-4 Sätze.
- Maximal 80 Wörter.
- Gib ausschließlich die fertige Antwort aus, ohne Anführungszeichen und ohne Erklärung.
- Die Antwort muss vollständig sein und mit einem vollständigen Satz enden.

Unternehmen: ${company}
Branche: ${industry}
Ton: ${tone}
Zusätzliche Infos: ${details}

Kundenbewertung:
${review}
${extra ? `

ZUSATZ:
${extra}` : ""}`;

        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": env.GEMINI_API_KEY
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                  maxOutputTokens: 500,
                  thinkingConfig: { thinkingLevel: "minimal" }
              }
            })
          }
        );

        const data = await response.json();
        if (!response.ok) {
          return json(
            { error: data?.error?.message || "Gemini API Fehler" },
            response.status
          );
        }

        const candidate = data?.candidates?.[0];
        const text = candidate?.content?.parts
          ?.map(part => part.text || "")
          .join("")
          .trim();

        if (!text) {
          return json({ error: "Gemini hat keine Antwort zurückgegeben." }, 502);
        }

        return json({
          text,
          finishReason: candidate?.finishReason || null
        });
      } catch (error) {
        return json({ error: error?.message || "Unbekannter Fehler." }, 500);
      }
    }

    // Everything else is served by Cloudflare's static assets.
    return env.ASSETS.fetch(request);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}
