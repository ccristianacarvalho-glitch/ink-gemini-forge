import { defaultNegativePrompt, designStyleLabels, spaceTypeLabels } from "@/data/archvizOptions";
import type { PreservationRule, Project, PromptSettings, RenderMode } from "@/types/archviz";

const modeDirective: Record<RenderMode, string> = {
  "full-render":
    "Transform this input image into a high-end architectural visualization render while preserving the base composition.",
  "localized-edit":
    "Perform a localized architectural visualization edit. Change only the specified masked or described region.",
  "new-angle":
    "Generate a coherent new camera angle for the same architectural space, keeping the spatial logic, materials, openings and design language consistent.",
  "style-variation":
    "Create a refined visual style variation of the same architectural scene, preserving the space planning and camera.",
};

export const buildGeometryGuardianText = (rules: PreservationRule[], mode: RenderMode) => {
  const enabledRules = rules.filter((rule) => rule.enabled).map((rule) => rule.promptFragment);
  const newAngleCaveat =
    mode === "new-angle"
      ? [
          "Because this is a new-angle request, the camera may change, but the room geometry, openings, scale, material logic and architectural continuity must remain credible.",
        ]
      : [];

  return [...enabledRules, ...newAngleCaveat].join(" ");
};

export const buildArchvizPrompt = (
  project: Project,
  settings: PromptSettings,
  rules: PreservationRule[],
  mode: RenderMode,
) => {
  const geometryText = buildGeometryGuardianText(rules, mode);
  const referenceText =
    project.assets.filter((asset) => asset.type === "reference").length > 0
      ? "Use reference images for material palette, mood, lighting and styling only. Never copy reference geometry."
      : "No external references were provided; infer a professional material and lighting direction from the selected project brief.";

  const areaText =
    mode === "localized-edit" && settings.localizedArea.trim()
      ? `Localized edit area: ${settings.localizedArea.trim()}.`
      : "";

  const cameraText =
    mode === "new-angle" && settings.cameraRequest.trim()
      ? `New camera angle request: ${settings.cameraRequest.trim()}.`
      : "";

  const prompt = [
    modeDirective[mode],
    `Project type: ${spaceTypeLabels[project.spaceType]}.`,
    `Target style: ${designStyleLabels[project.designStyle]}.`,
    `Design objective: ${settings.objective}.`,
    `Materials and finishes: ${settings.materials}.`,
    `Lighting: ${settings.lighting}.`,
    `Atmosphere: ${settings.atmosphere}.`,
    referenceText,
    areaText,
    cameraText,
    "Produce a realistic professional ArchViz image with natural lighting, physically plausible materials, balanced composition and refined interior design details.",
    `Geometry preservation rules: ${geometryText}`,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    prompt,
    negativePrompt: settings.negativePrompt.trim() || defaultNegativePrompt,
  };
};
