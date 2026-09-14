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

        const prompt = `Du bist der Antwortassistent für ein Unternehmen.

VERBINDLICHE REGELN:
1. Schreibe ausschließlich die fertige Antwort auf die Kundenbewertung.
2. Die Angaben im Block "ZUSÄTZLICHE INFOS – VERBINDLICH" sind konkrete Anweisungen des Unternehmens. Sie haben höchste Priorität und MÜSSEN umgesetzt werden.
3. Ignoriere keine einzelne Vorgabe aus diesem Block. Prüfe vor der Ausgabe jede Vorgabe noch einmal.
4. Wenn dort mehrere Vorgaben stehen, müssen ALLE gleichzeitig erfüllt werden.
5. Erfinde keine Vorgaben, die nicht dort stehen.

ANREDE:
- Steht dort "Anrede: Sie", verwende konsequent Sie/Ihnen/Ihr/Ihre und niemals du/dir/dein/dich.
- Steht dort "Anrede: Du" oder "per Du", verwende konsequent du/dir/dein/dich und niemals Sie/Ihnen/Ihr/Ihre.
- Steht dort "Anrede: Neutral", vermeide direkte Anredeformen, soweit natürlich möglich.

EMOJIS:
- Steht dort "Viele Emojis", MUSST du mehrere passende Emojis in die Antwort einbauen (mindestens 3, sinnvoll verteilt).
- Steht dort "Keine Emojis", darfst du kein Emoji verwenden.
- Steht dort eine konkrete Emoji-Vorgabe, befolge genau diese.

INHALT:
- Antworte auf Deutsch.
- Passe die Antwort exakt an den Inhalt der Bewertung an.
- Wenn die Bewertung gemischt ist, erwähne sowohl das Positive als auch die konkrete Kritik.
- Bei Kritik: verständnisvoll, sachlich und lösungsorientiert reagieren.
- Keine Fakten, Maßnahmen, Angebote, Versprechen, Gründe oder Entschuldigungen erfinden.
- Keine Namen erfinden.
- Keine rechtlichen Behauptungen.
- Keine typischen KI-Floskeln.
- Bei sehr kurzen Bewertungen 1–2 natürliche Sätze; sonst ungefähr 2–4 Sätze.
- Maximal 80 Wörter.
- Gib ausschließlich die fertige Antwort aus, ohne Anführungszeichen und ohne Erklärung.
- Die Antwort muss vollständig sein und mit einem vollständigen Satz enden.

UNTERNEHMEN: ${company}
BRANCHE: ${industry}
TON: ${tone}
ZUSÄTZLICHE INFOS – VERBINDLICH:
${extra || details || "Keine zusätzlichen Vorgaben."}

KUNDENBEWERTUNG:
${review}

Erstelle jetzt die Antwort und beachte JEDE Vorgabe aus "ZUSÄTZLICHE INFOS – VERBINDLICH".`;

        const response = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": env.GEMINI_API_KEY
            },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{
                  text: "Befolge die im Nutzerprompt enthaltenen Unternehmensvorgaben unter ZUSÄTZLICHE INFOS – VERBINDLICH vollständig. Keine dieser Vorgaben darf ignoriert werden."
                }]
              },
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
