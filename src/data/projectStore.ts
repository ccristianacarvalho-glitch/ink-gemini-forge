import { defaultPreservationRules } from "@/data/archvizOptions";
import { createId } from "@/lib/files";
import type { DesignStyle, Project, ProjectAsset, RenderVersion, SpaceType } from "@/types/archviz";

const STORAGE_KEY = "archviz-ai-studio-projects";

export const createProject = (
  name = "Atrium residence concept",
  spaceType: SpaceType = "living-room",
  designStyle: DesignStyle = "contemporary",
): Project => {
  const now = new Date().toISOString();
  return {
    id: createId("project"),
    name,
    spaceType,
    designStyle,
    status: "draft",
    createdAt: now,
    updatedAt: now,
    assets: [],
    versions: [],
  };
};

export const createDemoProject = (): Project => {
  const createdAt = "2026-07-17T12:00:00.000Z";
  return {
    id: "project-demo-lisbon-apartment",
    name: "Lisbon apartment refresh",
    spaceType: "living-room",
    designStyle: "japandi",
    status: "draft",
    createdAt,
    updatedAt: createdAt,
    assets: [],
    versions: [],
  };
};

export const loadProjects = (): Project[] => {
  if (typeof window === "undefined") return [createDemoProject()];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [createDemoProject()];
    const parsed = JSON.parse(raw) as Project[];
    return parsed.length > 0 ? parsed : [createDemoProject()];
  } catch {
    return [createDemoProject()];
  }
};

export const saveProjects = (projects: Project[]) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
};

export const attachAsset = (project: Project, asset: ProjectAsset): Project => {
  const nextAssets =
    asset.type === "base"
      ? [...project.assets.filter((item) => item.type !== "base"), asset]
      : [...project.assets, asset];

  return {
    ...project,
    assets: nextAssets,
    coverImageId: asset.type === "base" ? asset.id : project.coverImageId,
    updatedAt: new Date().toISOString(),
  };
};

export const appendVersion = (project: Project, version: RenderVersion): Project => ({
  ...project,
  status: "completed",
  updatedAt: new Date().toISOString(),
  assets: [
    ...project.assets,
    {
      id: version.id,
      type: "render",
      url: version.resultImageUrl,
      name: `Version ${project.versions.length + 1}`,
      createdAt: version.createdAt,
    },
  ],
  versions: [...project.versions, version],
});

export const createVersion = (
  project: Project,
  resultImageUrl: string,
  baseImageId: string,
  prompt: string,
  negativePrompt: string,
  mode: RenderVersion["mode"],
  objective: string,
  lighting: string,
  materials: string,
): RenderVersion => ({
  id: createId("version"),
  projectId: project.id,
  baseImageId,
  resultImageUrl,
  prompt,
  negativePrompt,
  preservationRules: defaultPreservationRules,
  mode,
  status: "succeeded",
  favorite: false,
  createdAt: new Date().toISOString(),
  metadata: {
    style: project.designStyle,
    spaceType: project.spaceType,
    objective,
    lighting,
    materials,
  },
});
