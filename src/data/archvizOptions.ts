import type { DesignStyle, PreservationRule, SpaceType } from "@/types/archviz";

export const spaceTypeLabels: Record<SpaceType, string> = {
  "living-room": "Living room",
  kitchen: "Kitchen",
  bedroom: "Bedroom",
  bathroom: "Bathroom",
  office: "Office",
  facade: "Facade",
  exterior: "Exterior",
  retail: "Retail",
  hospitality: "Hospitality",
};

export const designStyleLabels: Record<DesignStyle, string> = {
  minimalist: "Minimalist",
  contemporary: "Contemporary",
  scandinavian: "Scandinavian",
  japandi: "Japandi",
  industrial: "Industrial",
  luxury: "Luxury",
  mediterranean: "Mediterranean",
  "modern-classic": "Modern classic",
};

export const defaultPreservationRules: PreservationRule[] = [
  {
    id: "geometry",
    label: "Preserve main geometry and layout",
    enabled: true,
    promptFragment:
      "Preserve the original geometry, layout, proportions, perspective, camera angle and composition.",
  },
  {
    id: "openings",
    label: "Lock openings and structural elements",
    enabled: true,
    promptFragment:
      "Do not move walls, windows, doors, ceiling, floor, columns, stairs or fixed architectural elements.",
  },
  {
    id: "camera",
    label: "Keep camera for preservation renders",
    enabled: true,
    promptFragment:
      "For preservation renders, keep the original camera angle, focal length, vanishing points and framing.",
  },
  {
    id: "finish",
    label: "Upgrade finishes without breaking composition",
    enabled: true,
    promptFragment:
      "Improve materials, lighting, furniture styling, decoration and finish quality without destroying the base composition.",
  },
  {
    id: "mask",
    label: "Edit only selected area in mask mode",
    enabled: true,
    promptFragment:
      "For localized edits, alter only the masked or described area and preserve the rest of the image.",
  },
];

export const defaultNegativePrompt =
  "Do not distort architecture, do not change structural geometry, do not add impossible openings, do not warp perspective, do not move fixed walls, do not create cartoonish CGI, avoid blurry textures, avoid overexposed lighting, avoid duplicated furniture, avoid unrealistic scale.";
