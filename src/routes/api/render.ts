import { createFileRoute } from "@tanstack/react-router";

type HistoryTurn = {
  prompt?: string;
  instructions?: string;
  style?: string;
  image?: string; // previous rendered image (data URL)
};

type RenderBody = {
  prompt: string;
  instructions?: string;
  annotationBrief?: string;
  fullPrompt?: string;
  style?: string;
  baseImage: string; // data URL of base + overlay composite
  references?: string[]; // additional data URLs
  history?: HistoryTurn[]; // previous turns for iterative learning
};

const STYLE_GUIDE: Record<string, string> = {
  photorealistic:
    "Photorealistic, physically based rendering, natural lighting, sharp focus, realistic materials and textures, 8k detail.",
  cinematic:
    "Cinematic, dramatic key light with soft fill, shallow depth of field, film grain, anamorphic composition, moody color grade.",
  architectural:
    "Architectural visualization, accurate perspective, realistic global illumination, ambient occlusion, twilight or golden hour, premium materials.",
  interior:
    "Interior design render, warm ambient lighting, tasteful styling, natural window light, realistic fabrics wood and stone, editorial magazine feel.",
  product:
    "Studio product photography, clean seamless background, soft box lighting, crisp reflections, macro detail, commercial catalog quality.",
  editorial:
    "High-end editorial photography, natural daylight, muted refined palette, minimal composition, Kinfolk / Aesop aesthetic.",
  concept:
    "Concept art, painterly rendering, dynamic composition, cinematic atmosphere, matte painting quality.",
  sketch3d:
    "Semi-realistic 3D visualization, clean geometry, soft studio lighting, subtle materials, presentation quality.",
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

        const {
          prompt,
          instructions: userInstructions = "",
          annotationBrief = "",
          fullPrompt = "",
          style,
          baseImage,
          references = [],
          history = [],
        } = body;
        if (!prompt || !baseImage) {
          return Response.json({ error: "prompt and baseImage are required" }, { status: 400 });
        }

        const styleText = style && STYLE_GUIDE[style] ? STYLE_GUIDE[style] : "";

        // Build iterative context from history (learn from prior turns)
        const historyText =
          history.length > 0
            ? "\n\nITERATION CONTEXT — previous turns in this session (in order). " +
              "Learn from what the user has been asking, keep consistency of subject, materials and mood, " +
              "notice recurring instructions and preferences, and refine further:\n" +
              history
                .map(
                  (h, i) =>
                    `#${i + 1} style=${h.style ?? "-"} · prompt="${(h.prompt ?? "").slice(0, 300)}"` +
                    (h.instructions ? ` · instructions="${h.instructions.slice(0, 300)}"` : ""),
                )
                .join("\n")
            : "";

        const systemBlock =
          `You are a premium architectural, interior and product visualization renderer. ` +
          `The FIRST image is the CURRENT base scene WITH the user's annotations drawn on top ` +
          `(pen lines, arrows, highlights, text, rectangles). Every annotation is a precise spatial instruction: ` +
          `it marks WHERE to change something. The USER INSTRUCTIONS text below describes HOW to change it. ` +
          `Combine them — an arrow, highlight, pen mark or rectangle points at the exact region the instructions refer to. ` +
          `Any images that follow are STYLE & CONTENT REFERENCES (materials, lighting, mood, objects, palette). ` +
          `Any PREVIOUS RENDER images included are prior iterations by the same user — preserve their intent ` +
          `and progressively refine, do not restart from scratch. ` +
          `Produce ONE single photorealistic, premium-quality re-render of the base scene that follows the annotations, ` +
          `the user instructions, the references and the prior iterations. Preserve the original composition, ` +
          `perspective and framing unless instructions explicitly say otherwise. ` +
          `Remove any visible annotation marks from the final image.` +
          (styleText ? `\n\nSTYLE DIRECTIVE: ${styleText}` : "") +
          historyText +
          (annotationBrief ? `\n\n${annotationBrief}` : "") +
          (userInstructions
            ? `\n\nUSER INSTRUCTIONS (HOW to apply the annotations):\n${userInstructions}`
            : "") +
          `\n\nUSER PROMPT: ${prompt}` +
          (fullPrompt && fullPrompt !== prompt ? `\n\nCOMBINED CONTEXT:\n${fullPrompt}` : "");

        const content: Array<Record<string, unknown>> = [
          { type: "text", text: systemBlock },
          { type: "image_url", image_url: { url: baseImage } },
          ...references.map((url) => ({ type: "image_url", image_url: { url } })),
          ...history
            .filter((h) => h.image)
            .slice(-3) // cap to last 3 prior renders for token budget
            .map((h) => ({ type: "image_url", image_url: { url: h.image! } })),
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
