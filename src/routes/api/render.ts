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
          `Your job is to deliver a FULLY photorealistic, premium magazine-grade re-render — ` +
          `cinematic lighting, physically based materials, realistic global illumination, ` +
          `accurate reflections, depth and atmosphere. Render quality must always be top tier.\n\n` +
          `=== GEOMETRY LOCK (STRUCTURE ONLY) ===\n` +
          `The FIRST image defines the STRUCTURE of the scene. Preserve exactly:\n` +
          `- camera position, focal length, perspective, vanishing points and framing\n` +
          `- silhouettes, contours, edges and proportions of every object, wall, window, opening and structural element\n` +
          `- position, scale and alignment of every element already present\n` +
          `- horizon line, floor plane and wall planes\n` +
          `Do NOT invent, move, resize, rotate, add or remove geometry. Do NOT redesign the layout.\n\n` +
          `IMPORTANT: the geometry lock constrains SHAPE and LAYOUT only. It does NOT constrain ` +
          `render quality, materials, textures, lighting, shadows, reflections, color grading, ` +
          `atmosphere, depth of field or post-processing. Even if the base image looks like a rough ` +
          `sketch, a flat photo, a low-quality snapshot or a schematic drawing, you MUST upgrade it ` +
          `to a full premium photorealistic render while keeping the same geometry. Never mimic the ` +
          `base image's rendering style, resolution or fidelity — always push to premium photorealism.\n\n` +
          `=== ANNOTATIONS (WHERE) ===\n` +
          `The base image includes the user's annotations drawn on top (pen lines, arrows, highlights, text, rectangles). ` +
          `Each annotation marks WHERE to apply a change. Outside annotated regions, keep the geometry identical to the base ` +
          `but still rendered at full premium photorealistic quality. Remove the visible annotation marks from the final output.\n\n` +
          `=== USER INSTRUCTIONS (HOW) ===\n` +
          `The user instructions describe HOW to modify the annotated regions. Apply them within those regions, respecting the geometry lock.\n\n` +
          `=== REFERENCES ===\n` +
          `Any images after the first are STYLE references only (materials, lighting, mood, palette). ` +
          `NEVER copy their geometry, composition or layout. Any PREVIOUS RENDER images are prior iterations — ` +
          `keep their intent and continue refining, but the base image geometry still wins.\n\n` +
          `Output ONE single photorealistic, premium re-render: same geometry as the base, ` +
          `maximum render quality, with the requested material / lighting / annotated changes applied.` +
          (styleText ? `\n\nSTYLE DIRECTIVE (materials/lighting/mood, NOT geometry): ${styleText}` : "") +

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
