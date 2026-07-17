import { createFileRoute } from "@tanstack/react-router";

type HistoryTurn = {
  prompt?: string;
  instructions?: string;
  style?: string;
  image?: string;
};

type RenderBody = {
  prompt: string;
  instructions?: string;
  annotationBrief?: string;
  fullPrompt?: string;
  style?: string;
  baseImage: string;
  references?: string[];
  history?: HistoryTurn[];
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3.1-flash-image";
const MAX_REFERENCE_IMAGES = 6;
const MAX_HISTORY_IMAGES = 4;

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

const responseJson = (body: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...init?.headers,
    },
  });

const readRenderBody = async (request: Request): Promise<RenderBody> => {
  try {
    return (await request.json()) as RenderBody;
  } catch {
    throw new Error("Invalid JSON body.");
  }
};

const buildPromptText = (body: RenderBody): string => {
  const {
    prompt,
    instructions = "",
    annotationBrief = "",
    fullPrompt = "",
    style,
    history = [],
  } = body;
  const styleText = style && STYLE_GUIDE[style] ? STYLE_GUIDE[style] : "";
  const historyText =
    history.length > 0
      ? "\n\nITERATION CONTEXT - previous turns in this session, in order. Learn from recurring preferences, preserve subject continuity, and keep refining:\n" +
        history
          .slice(-MAX_HISTORY_IMAGES)
          .map(
            (turn, index) =>
              `#${index + 1} style=${turn.style ?? "-"} prompt="${(turn.prompt ?? "").slice(0, 300)}"` +
              (turn.instructions ? ` instructions="${turn.instructions.slice(0, 300)}"` : ""),
          )
          .join("\n")
      : "";

  return (
    `You are a premium architectural, interior and product visualization renderer. ` +
    `Deliver one photorealistic, magazine-grade re-render with cinematic lighting, physically based materials, realistic global illumination, accurate reflections, depth and atmosphere.\n\n` +
    `GEOMETRY LOCK\n` +
    `The first image defines the scene structure. Preserve camera position, focal length, perspective, vanishing points, framing, silhouettes, contours, edges, proportions, object positions, scale, alignment, horizon line, floor plane and wall planes. Do not invent, move, resize, rotate, add or remove geometry.\n\n` +
    `QUALITY LOCK\n` +
    `The geometry lock constrains shape and layout only. Upgrade the image to premium photorealism regardless of whether the base is a sketch, flat photo, low-quality snapshot or schematic drawing. Do not mimic low fidelity from the base image.\n\n` +
    `ANNOTATIONS\n` +
    `The first image may include drawn annotations. Use them only as location markers for requested changes, then remove all visible annotation marks from the final image.\n\n` +
    `REFERENCES\n` +
    `Images after the first are style, material, lighting, mood and palette references only. Never copy their geometry, composition or layout. Previous render images are iteration references, but the base image geometry still wins.\n\n` +
    `Return a single final image only.` +
    (styleText ? `\n\nSTYLE DIRECTIVE: ${styleText}` : "") +
    historyText +
    (annotationBrief ? `\n\nANNOTATION BRIEF:\n${annotationBrief}` : "") +
    (instructions ? `\n\nUSER INSTRUCTIONS:\n${instructions}` : "") +
    `\n\nUSER PROMPT:\n${prompt}` +
    (fullPrompt && fullPrompt !== prompt ? `\n\nCOMBINED CONTEXT:\n${fullPrompt}` : "")
  );
};

type ContentPart =
  { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

const buildContent = (body: RenderBody): ContentPart[] => {
  const parts: ContentPart[] = [
    { type: "text", text: buildPromptText(body) },
    { type: "image_url", image_url: { url: body.baseImage } },
  ];
  for (const ref of (body.references ?? []).slice(0, MAX_REFERENCE_IMAGES)) {
    parts.push({ type: "image_url", image_url: { url: ref } });
  }
  for (const turn of (body.history ?? []).slice(-MAX_HISTORY_IMAGES)) {
    if (turn.image) parts.push({ type: "image_url", image_url: { url: turn.image } });
  }
  return parts;
};

const extractImage = (data: unknown): string | null => {
  const d = data as {
    choices?: Array<{
      message?: {
        images?: Array<{ image_url?: { url?: string } }>;
        content?: unknown;
      };
    }>;
  };
  const msg = d.choices?.[0]?.message;
  const url = msg?.images?.[0]?.image_url?.url;
  if (typeof url === "string" && url.startsWith("data:")) return url;
  return null;
};

const generateRender = async (body: RenderBody, apiKey: string): Promise<string> => {
  const model = process.env.LOVABLE_IMAGE_MODEL?.trim() || DEFAULT_MODEL;
  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: buildContent(body) }],
      modalities: ["image", "text"],
    }),
  });

  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Gateway returned non-JSON [${response.status}]: ${text.slice(0, 300)}`);
  }

  if (!response.ok) {
    if (response.status === 429) throw new Error("Rate limit exceeded. Please try again shortly.");
    if (response.status === 402)
      throw new Error("AI credits exhausted. Please add credits in your workspace.");
    const msg = (data as { error?: { message?: string } }).error?.message ?? text;
    throw new Error(`Render request failed [${response.status}]: ${msg}`);
  }

  const image = extractImage(data);
  if (!image) throw new Error("Model did not return an image.");
  return image;
};

export const Route = createFileRoute("/api/render")({
  server: {
    handlers: {
      GET: async () =>
        responseJson({
          ok: true,
          endpoint: "/api/render",
          provider: "lovable-ai-gateway",
          model: process.env.LOVABLE_IMAGE_MODEL?.trim() || DEFAULT_MODEL,
        }),
      POST: async ({ request }) => {
        try {
          const apiKey = process.env.LOVABLE_API_KEY;
          if (!apiKey) {
            return responseJson({ error: "Missing LOVABLE_API_KEY." }, { status: 500 });
          }
          const body = await readRenderBody(request);
          if (!body.prompt?.trim() || !body.baseImage?.trim()) {
            return responseJson({ error: "prompt and baseImage are required." }, { status: 400 });
          }
          const image = await generateRender(body, apiKey);
          return responseJson({ image });
        } catch (error) {
          return responseJson(
            { error: error instanceof Error ? error.message : "Render failed." },
            { status: 500 },
          );
        }
      },
    },
  },
});
