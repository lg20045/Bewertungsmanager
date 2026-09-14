export default {
  async fetch(request, env) {
    const url = new URL(request.url);

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

        if (!env.AI) {
          return json({
            error: "Cloudflare Workers AI ist im Worker noch nicht verbunden."
          }, 500);
        }

        const toneRules = {
          "Professionell":
            "sachlich, souverän, klar und professionell; keine Umgangssprache",
          "Freundlich & persönlich":
            "warm, persönlich, menschlich und freundlich; nicht steif",
          "Locker & modern":
            "locker, modern, natürlich und unkompliziert; darf leicht umgangssprachlich sein",
          "Kurz & direkt":
            "sehr kompakt, direkt und auf den Punkt; möglichst 1-2 Sätze",
          "Hochwertig & elegant":
            "stilvoll, ruhig, hochwertig und besonders sauber formuliert"
        };

        const toneInstruction =
          toneRules[tone] || toneRules["Professionell"];

        const prompt = `Du bist der Antwortassistent für ein Unternehmen. Schreibe eine natürliche, individuelle Antwort auf die Kundenbewertung.

VERBINDLICHER SCHREIBSTIL:
- Gewählter Ton: ${tone}
- Umsetzung: ${toneInstruction}

VERBINDLICHE REGELN:
- Antworte auf Deutsch.
- Passe die Antwort exakt an den Inhalt der Bewertung an.
- Jede konkrete Zusatzangabe oder Anweisung des Nutzers ist verbindlich und muss in der fertigen Antwort umgesetzt werden, sofern sie nicht einer anderen verbindlichen Vorgabe widerspricht.
- Zusatzangaben sind keine bloßen Informationen, sondern Arbeitsanweisungen für genau diese Antwort. Prüfe jede einzelne Anweisung und setze sie gezielt um.
- Wenn eine Zusatzangabe beispielsweise verlangt, den Bewerter als "Hund" zu bezeichnen, muss diese Formulierung sinngemäß in die Antwort aufgenommen werden.
- Wenn die Unternehmensvorgaben oder Zusatzangaben "Viele Emojis", "mit Emojis" oder eine vergleichbare Emoji-Vorgabe enthalten, MUSST du mehrere passende Emojis in die Antwort einbauen (typischerweise 2-4). Ignoriere diese Vorgabe nicht.
- Wenn die Bewertung gemischt ist, erwähne sowohl das Positive als auch die konkrete Kritik.
- Bei Kritik: verständnisvoll, sachlich und lösungsorientiert reagieren.
- Keine Fakten, Maßnahmen, Angebote, Versprechen, Gründe oder Entschuldigungen erfinden. Vom Nutzer ausdrücklich vorgegebene Inhalte oder Anweisungen dürfen und sollen verwendet werden.
- Keine Namen erfinden.
- Keine rechtlichen Behauptungen.
- Keine typischen KI-Floskeln.
- Nicht automatisch mit "Vielen Dank für Ihr wertvolles Feedback" beginnen.
- Nicht automatisch mit "Es freut uns sehr" beginnen.
- Bei sehr kurzen Bewertungen 1-2 natürliche Sätze; sonst ungefähr 2-4 Sätze.
- Maximal 80 Wörter.
- Gib ausschließlich die fertige Antwort aus.
- Keine Anführungszeichen.
- Die Antwort muss mit einem vollständigen Satz enden.
- Kontrolliere vor der Ausgabe, ob ALLE konkreten Zusatzangaben tatsächlich umgesetzt wurden. Eine Zusatzangabe darf nicht stillschweigend ignoriert werden.

ANREDE / UNTERNEHMENSVORGABEN:
${details}

Unternehmen: ${company}
Branche: ${industry}

${extra ? `Zusätzliche Unternehmensvorgaben:
${extra}

` : ""}Kundenbewertung:
${review}`;

        const response = await env.AI.run(
          "@cf/google/gemma-4-26b-a4b-it",
          {
            messages: [
              {
                role: "system",
                content:
                  "Du bist ein sehr guter deutscher Kundenservice-Texter. Befolge die Vorgaben des Nutzers exakt."
              },
              {
                role: "user",
                content: prompt
              }
            ],
            chat_template_kwargs: {
              enable_thinking: false
            },
            max_tokens: 300
          }
        );

        const text =
          response?.choices?.[0]?.message?.content?.trim() ||
          response?.response?.trim() ||
          "";

        if (!text) {
          return json(
            { error: "Cloudflare AI hat keine Antwort zurückgegeben." },
            502
          );
        }

        return json({
          text,
          model: "@cf/google/gemma-4-26b-a4b-it",
          provider: "Cloudflare Workers AI"
        });
      } catch (error) {
        return json(
          { error: error?.message || "Cloudflare AI Fehler." },
          500
        );
      }
    }

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

  
