import type { RenderRequestInput } from "@/types/archviz";

type RenderResponse = {
  image?: string;
  error?: string;
};

export const renderArchvizImage = async (input: RenderRequestInput): Promise<string> => {
  const response = await fetch("/api/render", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      instructions: input.negativePrompt ? `Negative constraints: ${input.negativePrompt}` : "",
      annotationBrief: input.annotationBrief ?? "",
      fullPrompt: input.fullPrompt,
      style: "architectural",
      baseImage: input.baseImage.url,
      references: input.references.map((asset) => asset.url),
      history: input.history.slice(-4).map((version) => ({
        prompt: version.prompt,
        instructions: version.negativePrompt,
        style: version.metadata.style,
        image: version.resultImageUrl,
      })),
    }),
  });

  const data = (await response.json()) as RenderResponse;
  if (!response.ok || !data.image) {
    throw new Error(data.error || "Render failed.");
  }
  return data.image;
};
