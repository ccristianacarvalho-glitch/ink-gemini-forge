import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pen,
  Highlighter,
  Eraser,
  Type,
  ArrowUpRight,
  Square,
  Undo2,
  Trash2,
  Upload,
  Sparkles,
  Download,
  X,
  ImageIcon,
  Loader2,
  History,
  Wand2,
  RefreshCw,
} from "lucide-react";

type HistoryItem = {
  id: string;
  prompt: string;
  style: string;
  image: string;
  createdAt: number;
};

const STYLES: { id: string; label: string; hint: string }[] = [
  { id: "photorealistic", label: "Photorealistic", hint: "PBR · natural light · 8k detail" },
  { id: "cinematic", label: "Cinematic", hint: "Dramatic light · film grain · anamorphic" },
  { id: "architectural", label: "Architectural", hint: "GI · twilight · premium materials" },
  { id: "interior", label: "Interior Design", hint: "Warm ambient · editorial styling" },
  { id: "product", label: "Product Studio", hint: "Seamless bg · softbox · macro" },
  { id: "editorial", label: "Editorial", hint: "Daylight · muted · Kinfolk / Aesop" },
  { id: "concept", label: "Concept Art", hint: "Painterly · matte painting" },
  { id: "sketch3d", label: "3D Presentation", hint: "Clean geometry · studio light" },
];

const PROMPT_CHIPS = [
  "golden hour lighting",
  "overcast soft daylight",
  "twilight with warm interior glow",
  "polished concrete + oak",
  "brushed brass + travertine",
  "linen and boucle textiles",
  "shallow depth of field",
  "shot on 35mm, f/1.8",
  "minimal Scandinavian styling",
  "Japandi mood",
  "add tall greenery",
  "remove clutter",
];

type Tool = "pen" | "highlighter" | "eraser" | "text" | "arrow" | "rect";
type Point = { x: number; y: number };

type Stroke =
  | { id: string; type: "pen" | "highlighter"; color: string; size: number; points: Point[] }
  | { id: string; type: "arrow" | "rect"; color: string; size: number; start: Point; end: Point }
  | { id: string; type: "text"; color: string; size: number; pos: Point; text: string };

type RefImage = { id: string; name: string; dataUrl: string };

const PALETTE = [
  "#0a0a0a", "#ffffff", "#ef4444", "#f59e0b", "#eab308",
  "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];
const SIZES = [2, 4, 8, 14, 22];
const TOOLS: { id: Tool; label: string; Icon: typeof Pen }[] = [
  { id: "pen", label: "Pen", Icon: Pen },
  { id: "highlighter", label: "Highlighter", Icon: Highlighter },
  { id: "eraser", label: "Eraser", Icon: Eraser },
  { id: "text", label: "Text", Icon: Type },
  { id: "arrow", label: "Arrow", Icon: ArrowUpRight },
  { id: "rect", label: "Rectangle", Icon: Square },
];

const uid = () => Math.random().toString(36).slice(2, 10);

function distToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function strokeHit(s: Stroke, p: Point, r: number): boolean {
  if (s.type === "pen" || s.type === "highlighter") {
    for (let i = 1; i < s.points.length; i++) {
      if (distToSegment(p, s.points[i - 1], s.points[i]) <= r + s.size / 2) return true;
    }
    return s.points.some((pt) => Math.hypot(pt.x - p.x, pt.y - p.y) <= r + s.size / 2);
  }
  if (s.type === "arrow") return distToSegment(p, s.start, s.end) <= r + s.size / 2;
  if (s.type === "rect") {
    const x1 = Math.min(s.start.x, s.end.x), x2 = Math.max(s.start.x, s.end.x);
    const y1 = Math.min(s.start.y, s.end.y), y2 = Math.max(s.start.y, s.end.y);
    return (p.x >= x1 - r && p.x <= x2 + r && (Math.abs(p.y - y1) <= r || Math.abs(p.y - y2) <= r)) ||
      (p.y >= y1 - r && p.y <= y2 + r && (Math.abs(p.x - x1) <= r || Math.abs(p.x - x2) <= r));
  }
  if (s.type === "text") {
    const w = s.text.length * s.size * 0.6, h = s.size * 1.2;
    return p.x >= s.pos.x - r && p.x <= s.pos.x + w + r && p.y >= s.pos.y - h - r && p.y <= s.pos.y + r;
  }
  return false;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
}

export function AnnotationCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#ef4444");
  const [size, setSize] = useState(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [textInput, setTextInput] = useState<{ pos: Point; value: string } | null>(null);
  const drawingRef = useRef(false);

  const [images, setImages] = useState<RefImage[]>([]);
  const [baseId, setBaseId] = useState<string | null>(null);
  const [baseImg, setBaseImg] = useState<HTMLImageElement | null>(null);

  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<string>("photorealistic");
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  const base = images.find((i) => i.id === baseId) ?? null;

  useEffect(() => {
    let cancelled = false;
    if (!base) { setBaseImg(null); return; }
    loadImg(base.dataUrl).then((img) => { if (!cancelled) setBaseImg(img); });
    return () => { cancelled = true; };
  }, [base]);

  // Compute fitted rect for the base image (contain)
  const fittedRect = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap || !baseImg) return null;
    const { width: cw, height: ch } = wrap.getBoundingClientRect();
    const ir = baseImg.naturalWidth / baseImg.naturalHeight;
    const cr = cw / ch;
    let w = cw, h = ch;
    if (ir > cr) { w = cw; h = cw / ir; } else { h = ch; w = ch * ir; }
    return { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
  }, [baseImg]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const wrap = wrapRef.current!;
    const { width, height } = wrap.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);

    if (baseImg) {
      const r = fittedRect();
      if (r) ctx.drawImage(baseImg, r.x, r.y, r.w, r.h);
    }

    const all = draft ? [...strokes, draft] : strokes;
    for (const s of all) {
      ctx.save();
      if (s.type === "highlighter") {
        ctx.globalAlpha = 0.35;
        ctx.globalCompositeOperation = "multiply";
      }
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = s.size;
      if (s.type === "pen" || s.type === "highlighter") {
        if (s.points.length < 2) {
          ctx.beginPath();
          ctx.arc(s.points[0].x, s.points[0].y, s.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(s.points[0].x, s.points[0].y);
          for (let i = 1; i < s.points.length - 1; i++) {
            const mx = (s.points[i].x + s.points[i + 1].x) / 2;
            const my = (s.points[i].y + s.points[i + 1].y) / 2;
            ctx.quadraticCurveTo(s.points[i].x, s.points[i].y, mx, my);
          }
          const last = s.points[s.points.length - 1];
          ctx.lineTo(last.x, last.y);
          ctx.stroke();
        }
      } else if (s.type === "rect") {
        const x = Math.min(s.start.x, s.end.x);
        const y = Math.min(s.start.y, s.end.y);
        const w = Math.abs(s.end.x - s.start.x);
        const h = Math.abs(s.end.y - s.start.y);
        ctx.strokeRect(x, y, w, h);
      } else if (s.type === "arrow") {
        const { start, end } = s;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const head = Math.max(10, s.size * 3);
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      } else if (s.type === "text") {
        ctx.font = `500 ${Math.max(12, s.size * 4)}px Inter, system-ui, sans-serif`;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(s.text, s.pos.x, s.pos.y);
      }
      ctx.restore();
    }
  }, [strokes, draft, baseImg, fittedRect]);

  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [draw]);

  useEffect(() => { draw(); }, [draw]);

  const getPoint = (e: React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (textInput) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = getPoint(e);
    if (tool === "text") { setTextInput({ pos: p, value: "" }); return; }
    if (tool === "eraser") { drawingRef.current = true; eraseAt(p); return; }
    drawingRef.current = true;
    if (tool === "pen" || tool === "highlighter") {
      setDraft({ id: uid(), type: tool, color, size, points: [p] });
    } else if (tool === "arrow" || tool === "rect") {
      setDraft({ id: uid(), type: tool, color, size, start: p, end: p });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    const p = getPoint(e);
    if (tool === "eraser") { eraseAt(p); return; }
    setDraft((d) => {
      if (!d) return d;
      if (d.type === "pen" || d.type === "highlighter") return { ...d, points: [...d.points, p] };
      if (d.type === "arrow" || d.type === "rect") return { ...d, end: p };
      return d;
    });
  };

  const onPointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (draft) { setStrokes((s) => [...s, draft]); setDraft(null); }
  };

  const eraseAt = (p: Point) => {
    const r = Math.max(8, size * 1.5);
    setStrokes((all) => all.filter((s) => !strokeHit(s, p, r)));
  };

  const commitText = () => {
    if (!textInput) return;
    const t = textInput.value.trim();
    if (t) setStrokes((s) => [...s, { id: uid(), type: "text", color, size, pos: textInput.pos, text: t }]);
    setTextInput(null);
  };

  const undo = () => setStrokes((s) => s.slice(0, -1));
  const clear = () => setStrokes([]);

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: RefImage[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      const dataUrl = await fileToDataUrl(f);
      next.push({ id: uid(), name: f.name, dataUrl });
    }
    setImages((prev) => {
      const merged = [...prev, ...next];
      if (!baseId && next[0]) setBaseId(next[0].id);
      return merged;
    });
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((i) => i.id !== id));
    if (baseId === id) {
      const remaining = images.filter((i) => i.id !== id);
      setBaseId(remaining[0]?.id ?? null);
    }
  };

  // Build the composite image (base + annotations) at the natural resolution of base
  const buildComposite = async (): Promise<string> => {
    if (!baseImg) {
      // No base — flatten current canvas
      const canvas = canvasRef.current!;
      return canvas.toDataURL("image/png");
    }
    const r = fittedRect()!;
    const off = document.createElement("canvas");
    off.width = baseImg.naturalWidth;
    off.height = baseImg.naturalHeight;
    const ctx = off.getContext("2d")!;
    ctx.drawImage(baseImg, 0, 0);
    const sx = baseImg.naturalWidth / r.w;
    const sy = baseImg.naturalHeight / r.h;
    ctx.save();
    ctx.translate(-r.x * sx, -r.y * sy);
    ctx.scale(sx, sy);
    // re-draw strokes
    for (const s of strokes) {
      ctx.save();
      if (s.type === "highlighter") {
        ctx.globalAlpha = 0.35;
        ctx.globalCompositeOperation = "multiply";
      }
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.lineWidth = s.size;
      if (s.type === "pen" || s.type === "highlighter") {
        if (s.points.length < 2) {
          ctx.beginPath();
          ctx.arc(s.points[0].x, s.points[0].y, s.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(s.points[0].x, s.points[0].y);
          for (let i = 1; i < s.points.length - 1; i++) {
            const mx = (s.points[i].x + s.points[i + 1].x) / 2;
            const my = (s.points[i].y + s.points[i + 1].y) / 2;
            ctx.quadraticCurveTo(s.points[i].x, s.points[i].y, mx, my);
          }
          const last = s.points[s.points.length - 1];
          ctx.lineTo(last.x, last.y);
          ctx.stroke();
        }
      } else if (s.type === "rect") {
        const x = Math.min(s.start.x, s.end.x), y = Math.min(s.start.y, s.end.y);
        const w = Math.abs(s.end.x - s.start.x), h = Math.abs(s.end.y - s.start.y);
        ctx.strokeRect(x, y, w, h);
      } else if (s.type === "arrow") {
        ctx.beginPath();
        ctx.moveTo(s.start.x, s.start.y);
        ctx.lineTo(s.end.x, s.end.y);
        ctx.stroke();
        const angle = Math.atan2(s.end.y - s.start.y, s.end.x - s.start.x);
        const head = Math.max(10, s.size * 3);
        ctx.beginPath();
        ctx.moveTo(s.end.x, s.end.y);
        ctx.lineTo(s.end.x - head * Math.cos(angle - Math.PI / 6), s.end.y - head * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(s.end.x - head * Math.cos(angle + Math.PI / 6), s.end.y - head * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      } else if (s.type === "text") {
        ctx.font = `500 ${Math.max(12, s.size * 4)}px Inter, system-ui, sans-serif`;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(s.text, s.pos.x, s.pos.y);
      }
      ctx.restore();
    }
    ctx.restore();
    return off.toDataURL("image/png");
  };

  // Textual summary of the annotations, sent as part of the prompt so
  // the model treats every mark as an explicit instruction — not just pixels.
  const buildAnnotationBrief = (): string => {
    if (strokes.length === 0) return "";
    const counts = { pen: 0, highlighter: 0, arrow: 0, rect: 0, text: 0 };
    const texts: string[] = [];
    for (const s of strokes) {
      counts[s.type as keyof typeof counts]++;
      if (s.type === "text") texts.push(`"${s.text}"`);
    }
    const parts: string[] = [];
    if (counts.pen) parts.push(`${counts.pen} pen mark(s)`);
    if (counts.highlighter) parts.push(`${counts.highlighter} highlight(s)`);
    if (counts.arrow) parts.push(`${counts.arrow} arrow(s) pointing at areas to change`);
    if (counts.rect) parts.push(`${counts.rect} rectangle(s) framing regions to modify`);
    if (counts.text) parts.push(`${counts.text} written note(s): ${texts.join(", ")}`);
    return `ANNOTATIONS ON THE IMAGE (treat as explicit instructions): ${parts.join("; ")}.`;
  };

  const handleRender = async () => {
    if (!base) { setRenderError("Upload at least one image first."); return; }
    setRendering(true);
    setRenderError(null);
    try {
      const composite = await buildComposite();
      const references = images
        .filter((i) => i.id !== baseId && !i.name.startsWith("render-"))
        .map((i) => i.dataUrl);
      const brief = buildAnnotationBrief();
      const userPrompt = prompt.trim() || "Premium re-render following the annotations.";
      const effectivePrompt = brief ? `${brief}\n\n${userPrompt}` : userPrompt;
      const res = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: effectivePrompt,
          style,
          baseImage: composite,
          references,
          history: history.slice(-4).map((h) => ({
            prompt: h.prompt,
            style: h.style,
            image: h.image,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.image) throw new Error(data.error || "Render failed");

      // Replace the base image in-place with the newly generated render.
      // Annotations reset, so the next strokes modify the fresh render.
      const newImg: RefImage = {
        id: uid(),
        name: `render-${Date.now()}.png`,
        dataUrl: data.image,
      };
      setImages((prev) => {
        const withoutBase = baseId ? prev.filter((i) => i.id !== baseId) : prev;
        return [newImg, ...withoutBase];
      });
      setBaseId(newImg.id);
      setStrokes([]);
      setHistory((h) => [
        ...h,
        { id: uid(), prompt: effectivePrompt, style, image: data.image, createdAt: Date.now() },
      ]);
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : String(e));
    } finally {
      setRendering(false);
    }
  };

  const useRenderAsBase = async (dataUrl: string) => {
    const img: RefImage = { id: uid(), name: `render-${Date.now()}.png`, dataUrl };
    setImages((prev) => [img, ...prev]);
    setBaseId(img.id);
    setStrokes([]);
    setResult(null);
  };



  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-accent" />
          <h1 className="text-sm font-semibold tracking-tight uppercase">Render Studio</h1>
          <span className="text-xs text-muted-foreground font-mono">/ premium re-render</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={undo}
            disabled={strokes.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium transition hover:bg-surface-elevated disabled:opacity-40"
          >
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </button>
          <button
            onClick={clear}
            disabled={strokes.length === 0}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium transition hover:bg-destructive hover:border-destructive disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Tools */}
        <aside className="flex w-16 flex-col items-center gap-1 border-r border-border bg-surface py-4">
          {TOOLS.map(({ id, label, Icon }) => (
            <button
              key={id}
              title={label}
              onClick={() => setTool(id)}
              className={`group relative flex h-11 w-11 items-center justify-center rounded-md transition ${
                tool === id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
              }`}
            >
              <Icon className="h-4.5 w-4.5" strokeWidth={tool === id ? 2.25 : 1.75} />
            </button>
          ))}
        </aside>

        {/* References panel */}
        <aside className="flex w-64 flex-col border-r border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Images
            </h2>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-elevated px-2 py-1 text-[11px] font-medium hover:border-accent hover:text-accent"
            >
              <Upload className="h-3 w-3" /> Upload
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
            />
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {images.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-[11px] text-muted-foreground">
                <ImageIcon className="mx-auto mb-2 h-6 w-6 opacity-50" />
                Upload one or more reference images. The first becomes the base scene.
              </div>
            )}
            {images.map((img) => {
              const isBase = img.id === baseId;
              return (
                <div
                  key={img.id}
                  className={`group relative overflow-hidden rounded-md border ${
                    isBase ? "border-accent" : "border-border"
                  }`}
                >
                  <img src={img.dataUrl} alt={img.name} className="block h-24 w-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/60 px-2 py-1 text-[10px]">
                    <button
                      onClick={() => setBaseId(img.id)}
                      className={isBase ? "font-semibold text-accent" : "text-white/80 hover:text-white"}
                    >
                      {isBase ? "● BASE" : "Set as base"}
                    </button>
                    <button
                      onClick={() => removeImage(img.id)}
                      className="text-white/70 hover:text-destructive"
                      title="Remove"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="border-t border-border p-3 text-[10px] text-muted-foreground">
            <span className="font-semibold text-foreground">{images.length}</span> image{images.length === 1 ? "" : "s"} · base anchors the render, others act as style references.
          </div>
        </aside>

        {/* Canvas */}
        <main className="relative flex-1 bg-canvas" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            className={`absolute inset-0 ${
              tool === "eraser" ? "cursor-cell" : tool === "text" ? "cursor-text" : "cursor-crosshair"
            }`}
            style={{ touchAction: "none" }}
          />
          {!base && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="rounded-lg border border-dashed border-border/60 bg-background/60 px-6 py-4 text-center text-xs text-muted-foreground">
                Upload an image to begin · multiple uploads supported
              </div>
            </div>
          )}
          {textInput && (
            <input
              autoFocus
              value={textInput.value}
              onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitText();
                if (e.key === "Escape") setTextInput(null);
              }}
              placeholder="Type…"
              className="absolute bg-transparent outline-none border-b-2 border-accent px-1 placeholder:text-black/30"
              style={{
                left: textInput.pos.x,
                top: textInput.pos.y - Math.max(12, size * 4),
                color,
                fontSize: `${Math.max(12, size * 4)}px`,
                fontWeight: 500,
                minWidth: "120px",
                fontFamily: "Inter, system-ui, sans-serif",
              }}
            />
          )}
        </main>

        {/* Right: tool settings + render */}
        <aside className="flex w-72 flex-col gap-5 border-l border-border bg-surface p-4 overflow-y-auto">
          <section>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Color</h2>
            <div className="grid grid-cols-5 gap-1.5">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-md border-2 transition ${
                    color === c ? "border-accent scale-110" : "border-border hover:border-muted-foreground"
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-8 cursor-pointer rounded-md border border-border bg-transparent"
              />
              <span className="font-mono text-xs text-muted-foreground">{color.toUpperCase()}</span>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Size</h2>
            <div className="flex items-center justify-between">
              {SIZES.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`flex h-9 w-9 items-center justify-center rounded-md border transition ${
                    size === s ? "border-accent bg-surface-elevated" : "border-border hover:bg-surface-elevated"
                  }`}
                >
                  <span
                    className="block rounded-full"
                    style={{ width: Math.min(s, 18), height: Math.min(s, 18), backgroundColor: color }}
                  />
                </button>
              ))}
            </div>
            <input
              type="range" min={1} max={40} value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="mt-4 w-full accent-accent"
            />
            <div className="mt-1 font-mono text-xs text-muted-foreground">{size}px</div>
          </section>

          <section className="space-y-2">
            <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Render style
            </h2>
            <div className="grid grid-cols-2 gap-1.5">
              {STYLES.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStyle(s.id)}
                  title={s.hint}
                  className={`rounded-md border px-2 py-1.5 text-left text-[11px] leading-tight transition ${
                    style === s.id
                      ? "border-accent bg-accent/10 text-foreground"
                      : "border-border bg-background/40 text-muted-foreground hover:border-muted-foreground hover:text-foreground"
                  }`}
                >
                  <div className="font-semibold">{s.label}</div>
                  <div className="mt-0.5 text-[9px] opacity-70">{s.hint}</div>
                </button>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Render prompt
              </h2>
              <Wand2 className="h-3 w-3 text-muted-foreground" />
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the re-render: materials, lighting, mood, what to change…"
              rows={4}
              className="w-full resize-none rounded-md border border-border bg-background/60 p-2 text-xs leading-relaxed outline-none focus:border-accent"
            />
            <div className="flex flex-wrap gap-1">
              {PROMPT_CHIPS.map((c) => (
                <button
                  key={c}
                  onClick={() =>
                    setPrompt((p) => (p.trim() ? `${p.trim()}, ${c}` : c))
                  }
                  className="rounded-full border border-border bg-background/40 px-2 py-0.5 text-[10px] text-muted-foreground transition hover:border-accent hover:text-accent"
                >
                  + {c}
                </button>
              ))}
            </div>
            <button
              onClick={handleRender}
              disabled={rendering || !base}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-xs font-semibold uppercase tracking-wider text-accent-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              {rendering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              {rendering ? "Rendering…" : history.length > 0 ? "Refine render" : "Render"}
            </button>
            {history.length > 0 && (
              <p className="text-[10px] leading-relaxed text-muted-foreground">
                The engine keeps context of your last {Math.min(history.length, 4)} render{history.length === 1 ? "" : "s"} — each new render learns from prior prompts and annotations.
              </p>
            )}
            {renderError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
                {renderError}
              </div>
            )}
          </section>

          {history.length > 0 && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  <History className="mr-1 inline h-3 w-3" /> Versions
                </h2>
                <button
                  onClick={() => setHistory([])}
                  className="text-[10px] text-muted-foreground hover:text-destructive"
                >
                  clear
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {[...history].reverse().map((h, i) => (
                  <div
                    key={h.id}
                    className="group relative overflow-hidden rounded-md border border-border"
                  >
                    <img src={h.image} alt={h.prompt} className="block h-20 w-full object-cover" />
                    <div className="absolute inset-x-0 top-0 flex items-center justify-between bg-black/60 px-1.5 py-0.5 text-[9px] font-mono text-white/80">
                      <span>v{history.length - i}</span>
                      <span className="truncate">{h.style}</span>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 flex opacity-0 transition group-hover:opacity-100">
                      <button
                        onClick={() => setResult(h.image)}
                        className="flex-1 bg-black/70 px-1 py-1 text-[9px] text-white hover:bg-black/90"
                      >
                        view
                      </button>
                      <button
                        onClick={() => useRenderAsBase(h.image)}
                        className="flex-1 bg-accent/80 px-1 py-1 text-[9px] font-semibold text-accent-foreground hover:bg-accent"
                        title="Use as new base and continue iterating"
                      >
                        <RefreshCw className="mx-auto h-2.5 w-2.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="rounded-md border border-border bg-background/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
              <div className="mb-1 font-semibold uppercase tracking-wider text-foreground">
                {TOOLS.find((t) => t.id === tool)?.label}
              </div>
              {tool === "eraser" ? "Drag across strokes to remove them."
                : tool === "text" ? "Click anywhere to place text. Enter to commit."
                : tool === "arrow" || tool === "rect" ? "Click and drag to draw."
                : "Draw freely. Pen is opaque, highlighter is translucent."}
            </div>
          </section>
        </aside>
      </div>

      {/* Result modal */}
      {result && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6" onClick={() => setResult(null)}>
          <div className="relative max-h-full max-w-5xl overflow-hidden rounded-lg border border-border bg-surface" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="h-3.5 w-3.5 text-accent" /> Rendered result
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={result}
                  download="render.png"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:border-accent hover:text-accent"
                >
                  <Download className="h-3 w-3" /> Download
                </a>
                <button
                  onClick={() => setResult(null)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border hover:border-destructive hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <img src={result} alt="render" className="block max-h-[80vh] w-auto" />
          </div>
        </div>
      )}
    </div>
  );
}
