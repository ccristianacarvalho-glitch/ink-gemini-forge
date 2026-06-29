import { createFileRoute } from "@tanstack/react-router";

type RenderBody = {
  prompt: string;
  baseImage: string; // data URL of base + overlay composite
  references?: string[]; // additional data URLs
};

export const Route = createFileRoute("/api/render")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return Response.json({ error: "Missing LOVABLE_API_KEY" }, { status: 500 });
        }

        let body: RenderBody;
        try {
          body = (await request.json()) as RenderBody;
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const { prompt, baseImage, references = [] } = body;
        if (!prompt || !baseImage) {
          return Response.json({ error: "prompt and baseImage are required" }, { status: 400 });
        }

        const content: Array<Record<string, unknown>> = [
          {
            type: "text",
            text:
              `You are a premium architectural & product visualization renderer. ` +
              `The FIRST image is the base scene WITH user annotations (lines, arrows, text, highlights) drawn on top — ` +
              `treat the annotations as instructions describing what to change, add, remove or emphasize. ` +
              `Any additional images are STYLE & CONTENT REFERENCES (materials, lighting, mood, objects). ` +
              `Produce a single photorealistic, premium-quality re-render of the base scene that follows the annotations ` +
              `and references. Preserve the original composition, perspective and framing unless the annotations say otherwise. ` +
              `\n\nUser prompt: ${prompt}`,
          },
          { type: "image_url", image_url: { url: baseImage } },
          ...references.map((url) => ({ type: "image_url", image_url: { url } })),
        ];

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image-preview",
            messages: [{ role: "user", content }],
            modalities: ["image", "text"],
          }),
        });

        if (!upstream.ok) {
          const text = await upstream.text();
          return Response.json(
            { error: `Gateway error ${upstream.status}: ${text.slice(0, 500)}` },
            { status: upstream.status },
          );
        }

        const data = (await upstream.json()) as {
          choices?: Array<{
            message?: {
              images?: Array<{ image_url?: { url?: string } }>;
              content?: string;
            };
          }>;
        };

        const image = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (!image) {
          return Response.json(
            { error: "No image returned from model", raw: data },
            { status: 502 },
          );
        }

        return Response.json({ image });
      },
    },
  },
});
