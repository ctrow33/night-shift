import { NextResponse } from "next/server";

// Runs on the server only, so ANTHROPIC_API_KEY is never exposed to the browser.
export async function POST(req) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "Screenshot reading isn't configured." }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  const { image, media_type } = body || {};
  if (!image) return NextResponse.json({ error: "No image sent." }, { status: 400 });

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001", // cheap, handles vision fine
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: media_type || "image/jpeg", data: image } },
              {
                type: "text",
                text:
                  "This is a screenshot of a Garmin sleep summary. Read the large Sleep Score number (0-100) and the total sleep Duration. " +
                  'Reply with ONLY raw JSON, no markdown and no other text: {"score": <number or null>, "hours": <number or null>, "minutes": <number or null>}. ' +
                  "Use null for any value you cannot see.",
              },
            ],
          },
        ],
      }),
    });

    if (!r.ok) {
      return NextResponse.json({ error: `Reader unavailable (${r.status}).` }, { status: 502 });
    }

    const json = await r.json();
    const text = (json.content || [])
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .replace(/```json|```/g, "")
      .trim();

    const parsed = JSON.parse(text);
    const minutes =
      parsed.hours == null && parsed.minutes == null
        ? null
        : (parsed.hours || 0) * 60 + (parsed.minutes || 0);

    return NextResponse.json({ score: parsed.score ?? null, minutes });
  } catch (e) {
    return NextResponse.json({ error: "Couldn't read that image." }, { status: 502 });
  }
}
