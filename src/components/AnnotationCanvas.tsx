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
} from "lucide-react";

type Tool = "pen" | "highlighter" | "eraser" | "text" | "arrow" | "rect";

type Point = { x: number; y: number };

type Stroke =
  | { id: string; type: "pen" | "highlighter"; color: string; size: number; points: Point[] }
  | { id: string; type: "arrow" | "rect"; color: string; size: number; start: Point; end: Point }
  | { id: string; type: "text"; color: string; size: number; pos: Point; text: string };

const PALETTE = [
  "#0a0a0a",
  "#ffffff",
  "#ef4444",
  "#f59e0b",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
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

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function distToSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
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
  if (s.type === "arrow") {
    return distToSegment(p, s.start, s.end) <= r + s.size / 2;
  }
  if (s.type === "rect") {
    const x1 = Math.min(s.start.x, s.end.x);
    const x2 = Math.max(s.start.x, s.end.x);
    const y1 = Math.min(s.start.y, s.end.y);
    const y2 = Math.max(s.start.y, s.end.y);
    const onEdge =
      (p.x >= x1 - r && p.x <= x2 + r && (Math.abs(p.y - y1) <= r || Math.abs(p.y - y2) <= r)) ||
      (p.y >= y1 - r && p.y <= y2 + r && (Math.abs(p.x - x1) <= r || Math.abs(p.x - x2) <= r));
    return onEdge;
  }
  if (s.type === "text") {
    const w = s.text.length * s.size * 0.6;
    const h = s.size * 1.2;
    return p.x >= s.pos.x - r && p.x <= s.pos.x + w + r && p.y >= s.pos.y - h - r && p.y <= s.pos.y + r;
  }
  return false;
}

export function AnnotationCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<string>("#0a0a0a");
  const [size, setSize] = useState<number>(4);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [draft, setDraft] = useState<Stroke | null>(null);
  const [textInput, setTextInput] = useState<{ pos: Point; value: string } | null>(null);
  const drawingRef = useRef(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

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
  }, [strokes, draft]);

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

  useEffect(() => {
    draw();
  }, [draw]);

  const getPoint = (e: React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (textInput) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = getPoint(e);

    if (tool === "text") {
      setTextInput({ pos: p, value: "" });
      return;
    }
    if (tool === "eraser") {
      drawingRef.current = true;
      eraseAt(p);
      return;
    }

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
    if (tool === "eraser") {
      eraseAt(p);
      return;
    }
    setDraft((d) => {
      if (!d) return d;
      if (d.type === "pen" || d.type === "highlighter") {
        return { ...d, points: [...d.points, p] };
      }
      if (d.type === "arrow" || d.type === "rect") {
        return { ...d, end: p };
      }
      return d;
    });
  };

  const onPointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (draft) {
      setStrokes((s) => [...s, draft]);
      setDraft(null);
    }
  };

  const eraseAt = (p: Point) => {
    const r = Math.max(8, size * 1.5);
    setStrokes((all) => all.filter((s) => !strokeHit(s, p, r)));
  };

  const commitText = () => {
    if (!textInput) return;
    const t = textInput.value.trim();
    if (t) {
      setStrokes((s) => [
        ...s,
        { id: uid(), type: "text", color, size, pos: textInput.pos, text: t },
      ]);
    }
    setTextInput(null);
  };

  const undo = () => setStrokes((s) => s.slice(0, -1));
  const clear = () => setStrokes([]);

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-accent" />
          <h1 className="text-sm font-semibold tracking-tight uppercase">Render Studio</h1>
          <span className="text-xs text-muted-foreground font-mono">/ canvas</span>
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

        <aside className="flex w-56 flex-col gap-6 border-l border-border bg-surface p-4">
          <section>
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Color
            </h2>
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
            <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Size
            </h2>
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
                    style={{
                      width: Math.min(s, 18),
                      height: Math.min(s, 18),
                      backgroundColor: color,
                    }}
                  />
                </button>
              ))}
            </div>
            <input
              type="range"
              min={1}
              max={40}
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
              className="mt-4 w-full accent-accent"
            />
            <div className="mt-1 font-mono text-xs text-muted-foreground">{size}px</div>
          </section>

          <section className="mt-auto">
            <div className="rounded-md border border-border bg-background/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
              <div className="mb-1 font-semibold uppercase tracking-wider text-foreground">
                {TOOLS.find((t) => t.id === tool)?.label}
              </div>
              {tool === "eraser"
                ? "Drag across strokes to remove them."
                : tool === "text"
                ? "Click anywhere to place text. Enter to commit."
                : tool === "arrow" || tool === "rect"
                ? "Click and drag to draw."
                : "Draw freely. Pen is opaque, highlighter is translucent."}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
