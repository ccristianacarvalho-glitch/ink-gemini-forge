export type ProjectStatus = "draft" | "rendering" | "completed";

export type SpaceType =
  | "living-room"
  | "kitchen"
  | "bedroom"
  | "bathroom"
  | "office"
  | "facade"
  | "exterior"
  | "retail"
  | "hospitality";

export type DesignStyle =
  | "minimalist"
  | "contemporary"
  | "scandinavian"
  | "japandi"
  | "industrial"
  | "luxury"
  | "mediterranean"
  | "modern-classic";

export type AssetType = "base" | "reference" | "mask" | "render";

export type RenderMode = "full-render" | "localized-edit" | "new-angle" | "style-variation";

export type RenderStatus = "queued" | "rendering" | "succeeded" | "failed";

export type ProjectAsset = {
  id: string;
  type: AssetType;
  url: string;
  name: string;
  createdAt: string;
};

export type PreservationRule = {
  id: string;
  label: string;
  promptFragment: string;
  enabled: boolean;
};

export type RenderVersion = {
  id: string;
  projectId: string;
  baseImageId: string;
  resultImageUrl: string;
  prompt: string;
  negativePrompt: string;
  preservationRules: PreservationRule[];
  mode: RenderMode;
  status: RenderStatus;
  createdAt: string;
  favorite: boolean;
  metadata: {
    style: DesignStyle;
    spaceType: SpaceType;
    objective: string;
    lighting: string;
    materials: string;
  };
};

export type Project = {
  id: string;
  name: string;
  spaceType: SpaceType;
  designStyle: DesignStyle;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  coverImageId?: string;
  assets: ProjectAsset[];
  versions: RenderVersion[];
};

export type PromptSettings = {
  objective: string;
  materials: string;
  lighting: string;
  atmosphere: string;
  negativePrompt: string;
  localizedArea: string;
  cameraRequest: string;
};

export type RenderRequestInput = {
  project: Project;
  mode: RenderMode;
  prompt: string;
  fullPrompt: string;
  negativePrompt: string;
  baseImage: ProjectAsset;
  references: ProjectAsset[];
  history: RenderVersion[];
  annotationBrief?: string;
};
