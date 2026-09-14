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

        const normalizedExtra = String(extra || details || "")
          .replace(/\s+/g, " ")
          .trim();

        const extraLower = normalizedExtra.toLowerCase();

        const wantsDu =
          /\b(anrede\s*:\s*du|per\s+du|schreib\s+per\s+du|du[- ]form)\b/i.test(normalizedExtra);

        const wantsSie =
          /\b(anrede\s*:\s*sie|per\s+sie|schreib\s+per\s+sie|sie[- ]form)\b/i.test(normalizedExtra);

        const wantsNeutral =
          /\b(anrede\s*:\s*neutral|neutrale?\s+anrede)\b/i.test(normalizedExtra);

        const wantsManyEmojis =
          /\bviele\s+emojis?\b/i.test(normalizedExtra);

        const wantsNoEmojis =
          /\bkeine\s+emojis?\b/i.test(normalizedExtra);

        let addressRule = "Keine spezielle Anredevorgabe.";
        if (wantsDu) {
          addressRule = "VERBINDLICH: DU-FORM. Verwende ausschließlich du/dir/dein/deine/dich. Verwende NICHT Sie/Ihnen/Ihr/Ihre.";
        } else if (wantsSie) {
          addressRule = "VERBINDLICH: SIE-FORM. Verwende ausschließlich Sie/Ihnen/Ihr/Ihre. Verwende NICHT du/dir/dein/deine/dich.";
        } else if (wantsNeutral) {
          addressRule = "VERBINDLICH: NEUTRALE ANREDE. Vermeide direkte Anredeformen du/Sie soweit natürlich möglich.";
        }

        let emojiRule = "Keine spezielle Emoji-Vorgabe.";
        if (wantsManyEmojis) {
          emojiRule = "VERBINDLICH: VIELE EMOJIS. Verwende mindestens 3 passende Emojis.";
        } else if (wantsNoEmojis) {
          emojiRule = "VERBINDLICH: KEINE EMOJIS. Verwende 0 Emojis.";
        }

        const prompt = `Du bist der Antwortassistent für ein Unternehmen. Schreibe eine natürliche, individuelle Antwort auf die Kundenbewertung.

DIESE UNTERNEHMENSVORGABEN SIND VERBINDLICH:
${addressRule}
${emojiRule}
- Alle weiteren Angaben unter ZUSÄTZLICHE INFOS sind ebenfalls verbindlich.
- Wenn mehrere Vorgaben vorhanden sind, müssen ALLE gleichzeitig erfüllt werden.
- Prüfe deine fertige Antwort vor der Ausgabe gegen jede Vorgabe.
- Erfinde keine zusätzlichen Unternehmensvorgaben.

ALLGEMEINE REGELN:
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
${normalizedExtra || "Keine zusätzlichen Vorgaben."}

KUNDENBEWERTUNG:
${review}

Erstelle jetzt die Antwort.`;

        const requestGemini = async (promptText) => {
          return fetch(
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
                    text: "Unternehmensvorgaben in ZUSÄTZLICHE INFOS sind verbindlich. Halte insbesondere Anrede- und Emoji-Vorgaben exakt ein."
                  }]
                },
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: {
                  maxOutputTokens: 500,
                  thinkingConfig: { thinkingLevel: "minimal" }
                }
              })
            }
          );
        };

        const extractText = async (response) => {
          return json({
          text,
          finishReason: null
        });

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
