import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgeCheck,
  Box,
  Camera,
  ChevronRight,
  Copy,
  Download,
  Eye,
  History,
  ImageIcon,
  Layers3,
  Loader2,
  Paintbrush,
  PanelRight,
  Plus,
  RefreshCw,
  Save,
  SlidersHorizontal,
  Sparkles,
  Star,
  Upload,
  Wand2,
} from "lucide-react";

import {
  defaultNegativePrompt,
  defaultPreservationRules,
  designStyleLabels,
  spaceTypeLabels,
} from "@/data/archvizOptions";
import {
  appendVersion,
  attachAsset,
  createDemoProject,
  createProject,
  createVersion,
  loadProjects,
  saveProjects,
} from "@/data/projectStore";
import { buildArchvizPrompt } from "@/features/prompts/promptGenerator";
import { createId, fileToDataUrl, formatDateTime } from "@/lib/files";
import { cn } from "@/lib/utils";
import { renderArchvizImage } from "@/services/ai/renderService";
import type {
  DesignStyle,
  Project,
  ProjectAsset,
  PromptSettings,
  RenderMode,
  RenderVersion,
  SpaceType,
} from "@/types/archviz";

const modeMeta: Record<RenderMode, { label: string; icon: typeof Wand2; hint: string }> = {
  "full-render": {
    label: "Full render",
    icon: Wand2,
    hint: "Preserve camera; redesign materials, light and styling.",
  },
  "style-variation": {
    label: "Style variation",
    icon: Paintbrush,
    hint: "Explore a new visual language without changing the scene.",
  },
  "new-angle": {
    label: "New angle",
    icon: Camera,
    hint: "Ask for a coherent camera variation of the same space.",
  },
  "localized-edit": {
    label: "Mask edit",
    icon: Box,
    hint: "Describe the area to edit and preserve everything else.",
  },
};

const defaultSettings: PromptSettings = {
  objective:
    "Create a premium client-facing render suitable for architectural presentation boards.",
  materials:
    "Natural oak, honed stone, warm white plaster, subtle metal accents and tactile textiles.",
  lighting: "Soft natural daylight with realistic global illumination and controlled highlights.",
  atmosphere: "Calm, refined, lived-in and editorial, with balanced contrast and realistic scale.",
  negativePrompt: defaultNegativePrompt,
  localizedArea: "",
  cameraRequest:
    "Create a slightly wider eye-level view from the adjacent corner while keeping the same room logic.",
};

const selectableSpaceTypes = Object.keys(spaceTypeLabels) as SpaceType[];
const selectableStyles = Object.keys(designStyleLabels) as DesignStyle[];

const getBaseAsset = (project: Project) => project.assets.find((asset) => asset.type === "base");
const getReferences = (project: Project) =>
  project.assets.filter((asset) => asset.type === "reference");
const getLatestVersion = (project: Project) => project.versions.at(-1);

function ProjectStatusPill({ project }: { project: Project }) {
  const label =
    project.status === "rendering"
      ? "Rendering"
      : project.status === "completed"
        ? "Completed"
        : "Draft";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-[11px] font-medium",
        project.status === "completed" &&
          "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
        project.status === "rendering" && "border-amber-400/40 bg-amber-400/10 text-amber-100",
        project.status === "draft" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </label>
  );
}

function SelectField<T extends string>({
  value,
  options,
  labels,
  onChange,
}: {
  value: T;
  options: T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-accent"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {labels[option]}
        </option>
      ))}
    </select>
  );
}

function UploadDropzone({
  label,
  hint,
  multiple,
  onFiles,
}: {
  label: string;
  hint: string;
  multiple?: boolean;
  onFiles: (files: FileList | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      className="flex min-h-28 w-full flex-col items-center justify-center rounded-md border border-dashed border-border bg-background/55 px-4 py-5 text-center transition hover:border-accent hover:bg-surface"
    >
      <Upload className="mb-2 h-5 w-5 text-accent" />
      <span className="text-sm font-semibold">{label}</span>
      <span className="mt-1 max-w-56 text-xs leading-5 text-muted-foreground">{hint}</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="hidden"
        onChange={(event) => {
          onFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
    </button>
  );
}

function CompareView({
  before,
  after,
  value,
  onChange,
}: {
  before?: string;
  after?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  if (!before && !after) {
    return (
      <div className="flex h-full min-h-96 items-center justify-center bg-canvas text-center text-sm text-slate-500">
        <div>
          <ImageIcon className="mx-auto mb-3 h-9 w-9 opacity-50" />
          Upload a base image to anchor the project.
        </div>
      </div>
    );
  }

  if (!after) {
    return (
      <img
        src={before}
        alt="Base architectural input"
        className="h-full min-h-96 w-full bg-canvas object-contain"
      />
    );
  }

  return (
    <div className="relative h-full min-h-96 overflow-hidden bg-canvas">
      <img
        src={after}
        alt="Rendered version"
        className="absolute inset-0 h-full w-full object-contain"
      />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${value}%` }}>
        <img
          src={before}
          alt="Original version"
          className="h-full object-contain"
          style={{ width: `${10000 / Math.max(value, 1)}%` }}
        />
      </div>
      <div
        className="absolute inset-y-0 w-px bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
        style={{ left: `${value}%` }}
      />
      <input
        aria-label="Before after comparison"
        type="range"
        min={5}
        max={95}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="absolute bottom-4 left-1/2 w-72 -translate-x-1/2 accent-accent"
      />
      <div className="absolute left-4 top-4 rounded-sm bg-black/70 px-2 py-1 text-[11px] font-medium text-white">
        Original
      </div>
      <div className="absolute right-4 top-4 rounded-sm bg-black/70 px-2 py-1 text-[11px] font-medium text-white">
        Render
      </div>
    </div>
  );
}

export function ArchVizStudioApp() {
  const [projects, setProjects] = useState<Project[]>(() => [createDemoProject()]);
  const [activeProjectId, setActiveProjectId] = useState(() => projects[0]?.id ?? "");
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [mode, setMode] = useState<RenderMode>("full-render");
  const [settings, setSettings] = useState<PromptSettings>(defaultSettings);
  const [preservationRules, setPreservationRules] = useState(defaultPreservationRules);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [compare, setCompare] = useState(50);
  const [error, setError] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);

  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];
  const baseAsset = activeProject ? getBaseAsset(activeProject) : undefined;
  const latestVersion = activeProject ? getLatestVersion(activeProject) : undefined;
  const selectedVersion =
    activeProject?.versions.find((version) => version.id === selectedVersionId) ?? latestVersion;

  const promptBundle = useMemo(() => {
    if (!activeProject) return { prompt: "", negativePrompt: "" };
    return buildArchvizPrompt(activeProject, settings, preservationRules, mode);
  }, [activeProject, settings, preservationRules, mode]);

  useEffect(() => {
    const storedProjects = loadProjects();
    setProjects(storedProjects);
    setActiveProjectId((current) =>
      storedProjects.some((project) => project.id === current)
        ? current
        : (storedProjects[0]?.id ?? ""),
    );
    setProjectsLoaded(true);
  }, []);

  useEffect(() => {
    if (!projectsLoaded) return;
    saveProjects(projects);
  }, [projects, projectsLoaded]);

  const updateProject = (project: Project) => {
    setProjects((current) => current.map((item) => (item.id === project.id ? project : item)));
  };

  const addProject = () => {
    const next = createProject(
      `New ArchViz project ${projects.length + 1}`,
      "living-room",
      "contemporary",
    );
    setProjects((current) => [next, ...current]);
    setActiveProjectId(next.id);
    setSelectedVersionId(null);
  };

  const setProjectField = <K extends keyof Project>(key: K, value: Project[K]) => {
    if (!activeProject) return;
    updateProject({ ...activeProject, [key]: value, updatedAt: new Date().toISOString() });
  };

  const addFiles = async (files: FileList | null, type: "base" | "reference") => {
    if (!activeProject || !files) return;
    let nextProject = activeProject;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const asset: ProjectAsset = {
        id: createId(type),
        type,
        url: await fileToDataUrl(file),
        name: file.name,
        createdAt: new Date().toISOString(),
      };
      nextProject = attachAsset(nextProject, asset);
    }
    updateProject(nextProject);
  };

  const runRender = async () => {
    if (!activeProject || !baseAsset) {
      setError("Upload a base image before rendering.");
      return;
    }

    setError(null);
    setIsRendering(true);
    updateProject({ ...activeProject, status: "rendering" });

    try {
      const resultImageUrl = await renderArchvizImage({
        project: activeProject,
        mode,
        prompt: promptBundle.prompt,
        fullPrompt: `${promptBundle.prompt}\n\nNegative prompt: ${promptBundle.negativePrompt}`,
        negativePrompt: promptBundle.negativePrompt,
        baseImage: baseAsset,
        references: getReferences(activeProject),
        history: activeProject.versions,
        annotationBrief:
          mode === "localized-edit" && settings.localizedArea
            ? `Selected edit area: ${settings.localizedArea}. Preserve everything outside this area.`
            : "",
      });

      const version = createVersion(
        activeProject,
        resultImageUrl,
        baseAsset.id,
        promptBundle.prompt,
        promptBundle.negativePrompt,
        mode,
        settings.objective,
        settings.lighting,
        settings.materials,
      );
      const nextProject = appendVersion(activeProject, version);
      updateProject(nextProject);
      setSelectedVersionId(version.id);
    } catch (renderError) {
      setError(renderError instanceof Error ? renderError.message : "Render failed.");
      updateProject({ ...activeProject, status: "draft" });
    } finally {
      setIsRendering(false);
    }
  };

  const duplicateVersion = (version: RenderVersion) => {
    if (!activeProject) return;
    const duplicate: RenderVersion = {
      ...version,
      id: createId("version"),
      createdAt: new Date().toISOString(),
      favorite: false,
      prompt: `${version.prompt}\n\nCreate a refined iteration with more polished details.`,
    };
    updateProject(appendVersion(activeProject, duplicate));
    setSelectedVersionId(duplicate.id);
  };

  const toggleFavorite = (versionId: string) => {
    if (!activeProject) return;
    updateProject({
      ...activeProject,
      versions: activeProject.versions.map((version) =>
        version.id === versionId ? { ...version, favorite: !version.favorite } : version,
      ),
    });
  };

  const restoreVersionAsBase = (version: RenderVersion) => {
    if (!activeProject) return;
    const asset: ProjectAsset = {
      id: createId("base"),
      type: "base",
      url: version.resultImageUrl,
      name: `Restored ${formatDateTime(version.createdAt)}`,
      createdAt: new Date().toISOString(),
    };
    updateProject(attachAsset(activeProject, asset));
  };

  if (!activeProject) return null;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
                ArchViz AI
              </div>
              <h1 className="mt-1 text-lg font-semibold tracking-tight">Studio</h1>
            </div>
            <button
              type="button"
              onClick={addProject}
              title="Create project"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:border-accent hover:text-accent"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {projects.map((project) => {
            const cover = project.coverImageId
              ? project.assets.find((asset) => asset.id === project.coverImageId)?.url
              : getLatestVersion(project)?.resultImageUrl;
            return (
              <button
                key={project.id}
                type="button"
                onClick={() => {
                  setActiveProjectId(project.id);
                  setSelectedVersionId(null);
                }}
                className={cn(
                  "mb-2 flex w-full gap-3 rounded-md border p-2 text-left transition",
                  project.id === activeProject.id
                    ? "border-accent bg-accent/10"
                    : "border-transparent hover:border-border hover:bg-background/70",
                )}
              >
                <div className="h-16 w-20 overflow-hidden rounded-sm bg-canvas">
                  {cover ? (
                    <img src={cover} alt={project.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-400">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{project.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {spaceTypeLabels[project.spaceType]} / {designStyleLabels[project.designStyle]}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <ProjectStatusPill project={project} />
                    <span className="text-[11px] text-muted-foreground">
                      {project.versions.length} versions
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border bg-background px-5">
          <div className="min-w-0">
            <input
              value={activeProject.name}
              onChange={(event) => setProjectField("name", event.target.value)}
              className="w-full bg-transparent text-lg font-semibold tracking-tight outline-none"
            />
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{spaceTypeLabels[activeProject.spaceType]}</span>
              <ChevronRight className="h-3 w-3" />
              <span>{designStyleLabels[activeProject.designStyle]}</span>
              <ChevronRight className="h-3 w-3" />
              <span>{formatDateTime(activeProject.updatedAt)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ProjectStatusPill project={activeProject} />
            <button
              type="button"
              onClick={runRender}
              disabled={isRendering || !baseAsset}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-45"
            >
              {isRendering ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isRendering ? "Rendering" : "Render"}
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px]">
          <section className="flex min-w-0 flex-col">
            <div className="grid grid-cols-4 gap-px border-b border-border bg-border">
              {(Object.entries(modeMeta) as Array<[RenderMode, (typeof modeMeta)[RenderMode]]>).map(
                ([id, meta]) => {
                  const Icon = meta.icon;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setMode(id)}
                      className={cn(
                        "flex min-h-16 items-center gap-3 bg-background px-4 text-left transition hover:bg-surface",
                        mode === id && "bg-surface text-accent",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold">{meta.label}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {meta.hint}
                        </span>
                      </span>
                    </button>
                  );
                },
              )}
            </div>

            <div className="min-h-0 flex-1">
              <CompareView
                before={baseAsset?.url}
                after={selectedVersion?.resultImageUrl}
                value={compare}
                onChange={setCompare}
              />
            </div>

            <div className="border-t border-border bg-surface px-5 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <Eye className="h-4 w-4 text-accent" />
                  <span>Before/after comparison</span>
                  {selectedVersion && (
                    <span>Version from {formatDateTime(selectedVersion.createdAt)}</span>
                  )}
                </div>
                {selectedVersion && (
                  <a
                    href={selectedVersion.resultImageUrl}
                    download={`${activeProject.name}-render.png`}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:border-accent hover:text-accent"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                )}
              </div>
            </div>
          </section>

          <aside className="min-h-0 overflow-y-auto border-l border-border bg-surface">
            <div className="space-y-6 p-5">
              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <PanelRight className="h-4 w-4 text-accent" />
                  <h2 className="text-sm font-semibold">Project setup</h2>
                </div>
                <div className="space-y-2">
                  <FieldLabel>Space type</FieldLabel>
                  <SelectField
                    value={activeProject.spaceType}
                    options={selectableSpaceTypes}
                    labels={spaceTypeLabels}
                    onChange={(value) => setProjectField("spaceType", value)}
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel>Design style</FieldLabel>
                  <SelectField
                    value={activeProject.designStyle}
                    options={selectableStyles}
                    labels={designStyleLabels}
                    onChange={(value) => setProjectField("designStyle", value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <UploadDropzone
                    label="Base image"
                    hint="Locks geometry, perspective and openings."
                    onFiles={(files) => addFiles(files, "base")}
                  />
                  <UploadDropzone
                    label="References"
                    hint="Mood, materials, styling and light."
                    multiple
                    onFiles={(files) => addFiles(files, "reference")}
                  />
                </div>
                {getReferences(activeProject).length > 0 && (
                  <div className="grid grid-cols-4 gap-2">
                    {getReferences(activeProject).map((asset) => (
                      <img
                        key={asset.id}
                        src={asset.url}
                        alt={asset.name}
                        className="aspect-square rounded-sm object-cover"
                      />
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-accent" />
                  <h2 className="text-sm font-semibold">Prompt Architect</h2>
                </div>
                {(["objective", "materials", "lighting", "atmosphere"] as const).map((key) => (
                  <div key={key} className="space-y-2">
                    <FieldLabel>{key}</FieldLabel>
                    <textarea
                      value={settings[key]}
                      onChange={(event) =>
                        setSettings((current) => ({ ...current, [key]: event.target.value }))
                      }
                      rows={key === "objective" ? 2 : 3}
                      className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm leading-5 outline-none focus:border-accent"
                    />
                  </div>
                ))}
                {mode === "new-angle" && (
                  <div className="space-y-2">
                    <FieldLabel>Camera request</FieldLabel>
                    <textarea
                      value={settings.cameraRequest}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          cameraRequest: event.target.value,
                        }))
                      }
                      rows={2}
                      className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm leading-5 outline-none focus:border-accent"
                    />
                  </div>
                )}
                {mode === "localized-edit" && (
                  <div className="space-y-2">
                    <FieldLabel>Mask / selected area</FieldLabel>
                    <textarea
                      value={settings.localizedArea}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          localizedArea: event.target.value,
                        }))
                      }
                      placeholder="Example: edit only the sofa wall, replace art and wall finish, preserve floor and windows."
                      rows={3}
                      className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm leading-5 outline-none focus:border-accent"
                    />
                  </div>
                )}
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-accent" />
                  <h2 className="text-sm font-semibold">Geometry Guardian</h2>
                </div>
                <div className="space-y-2">
                  {preservationRules.map((rule) => (
                    <label
                      key={rule.id}
                      className="flex gap-3 rounded-md border border-border bg-background/40 p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(event) =>
                          setPreservationRules((rules) =>
                            rules.map((item) =>
                              item.id === rule.id
                                ? { ...item, enabled: event.target.checked }
                                : item,
                            ),
                          )
                        }
                        className="mt-0.5 accent-accent"
                      />
                      <span>
                        <span className="block font-medium">{rule.label}</span>
                        <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                          {rule.promptFragment}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-accent" />
                  <h2 className="text-sm font-semibold">Generated prompt</h2>
                </div>
                <textarea
                  value={promptBundle.prompt}
                  readOnly
                  rows={9}
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground outline-none"
                />
                <textarea
                  value={settings.negativePrompt}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, negativePrompt: event.target.value }))
                  }
                  rows={4}
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-xs leading-5 outline-none focus:border-accent"
                />
                {error && (
                  <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <button
                  type="button"
                  onClick={runRender}
                  disabled={isRendering || !baseAsset}
                  className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-45"
                >
                  {isRendering ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Run AI render
                </button>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-accent" />
                    <h2 className="text-sm font-semibold">Version Curator</h2>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {activeProject.versions.length} saved
                  </span>
                </div>
                {activeProject.versions.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                    Rendered versions will appear here with prompt metadata and restore controls.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {[...activeProject.versions].reverse().map((version, index) => (
                      <div
                        key={version.id}
                        className={cn(
                          "overflow-hidden rounded-md border bg-background/55",
                          selectedVersion?.id === version.id ? "border-accent" : "border-border",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedVersionId(version.id)}
                          className="flex w-full gap-3 p-2 text-left"
                        >
                          <img
                            src={version.resultImageUrl}
                            alt="Render version"
                            className="h-20 w-24 rounded-sm object-cover"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold">
                                Version {activeProject.versions.length - index}
                              </span>
                              {version.favorite && (
                                <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                              )}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {modeMeta[version.mode].label} / {formatDateTime(version.createdAt)}
                            </span>
                            <span className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                              {version.metadata.objective}
                            </span>
                          </span>
                        </button>
                        <div className="grid grid-cols-4 border-t border-border">
                          <button
                            type="button"
                            title="Favorite"
                            onClick={() => toggleFavorite(version.id)}
                            className="flex h-9 items-center justify-center hover:bg-surface"
                          >
                            <Star className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Restore"
                            onClick={() => restoreVersionAsBase(version)}
                            className="flex h-9 items-center justify-center hover:bg-surface"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Duplicate"
                            onClick={() => duplicateVersion(version)}
                            className="flex h-9 items-center justify-center hover:bg-surface"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <a
                            title="Save"
                            href={version.resultImageUrl}
                            download="archviz-version.png"
                            className="flex h-9 items-center justify-center hover:bg-surface"
                          >
                            <Save className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-2 rounded-md border border-border bg-background/45 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Layers3 className="h-4 w-4 text-accent" />
                  Workflow state
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>Base image</div>
                  <div className="text-right text-foreground">
                    {baseAsset ? "Ready" : "Missing"}
                  </div>
                  <div>References</div>
                  <div className="text-right text-foreground">
                    {getReferences(activeProject).length}
                  </div>
                  <div>Mode</div>
                  <div className="text-right text-foreground">{modeMeta[mode].label}</div>
                  <div>Mask area</div>
                  <div className="text-right text-foreground">
                    {settings.localizedArea ? "Defined" : "Optional"}
                  </div>
                </div>
              </section>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
