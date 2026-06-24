import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sketchpad — Draw, Save & Export" },
      { name: "description", content: "An interactive browser drawing app with tools, history, gallery and PNG export." },
      { property: "og:title", content: "Sketchpad — Draw, Save & Export" },
      { property: "og:description", content: "Draw on a canvas with pen, eraser, line and rectangle tools. Save to your gallery and export PNG." },
    ],
  }),
  component: DrawingApp,
});

type Tool = "pen" | "eraser" | "line" | "rectangle";

const STORAGE_KEY = "savedDrawings";

function DrawingApp() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const snapshotRef = useRef<string | null>(null); // for shape preview
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const drawingRef = useRef(false);
  const historyRef = useRef<string[]>([]);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#111827");
  const [brushSize, setBrushSize] = useState(5);
  const [gallery, setGallery] = useState<string[]>([]);

  // Init canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctxRef.current = ctx;
    // initial history snapshot (blank)
    historyRef.current = [canvas.toDataURL()];

    // expose for tests
    (window as unknown as { getCanvasDataURL: () => string }).getCanvasDataURL = () =>
      canvas.toDataURL("image/png");
  }, []);

  // Load gallery from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setGallery(arr);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const getPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const pushHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    historyRef.current.push(canvas.toDataURL());
    if (historyRef.current.length > 50) historyRef.current.shift();
  }, []);

  const restoreFromDataURL = (dataURL: string) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    };
    img.src = dataURL;
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const { x, y } = getPos(e);
    drawingRef.current = true;
    startRef.current = { x, y };

    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";

    if (tool === "pen" || tool === "eraser") {
      ctx.beginPath();
      ctx.moveTo(x, y);
    } else {
      // snapshot for shape preview
      snapshotRef.current = canvas.toDataURL();
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;
    const { x, y } = getPos(e);

    if (tool === "pen" || tool === "eraser") {
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (snapshotRef.current && startRef.current) {
      // redraw snapshot then draw shape
      const img = new Image();
      const start = startRef.current;
      const snap = snapshotRef.current;
      img.onload = () => {
        ctx.globalCompositeOperation = "source-over";
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = color;
        ctx.lineWidth = brushSize;
        if (tool === "line") {
          ctx.beginPath();
          ctx.moveTo(start.x, start.y);
          ctx.lineTo(x, y);
          ctx.stroke();
        } else if (tool === "rectangle") {
          ctx.strokeRect(start.x, start.y, x - start.x, y - start.y);
        }
      };
      img.src = snap;
    }
  };

  const endStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const ctx = ctxRef.current;
    if (ctx) {
      ctx.closePath();
      ctx.globalCompositeOperation = "source-over";
    }
    snapshotRef.current = null;
    startRef.current = null;
    // delay slightly to capture async shape draws
    setTimeout(pushHistory, 30);
  };

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    historyRef.current.push(canvas.toDataURL());
  };

  const handleUndo = () => {
    if (historyRef.current.length <= 1) {
      handleClear();
      return;
    }
    historyRef.current.pop();
    const prev = historyRef.current[historyRef.current.length - 1];
    if (prev) restoreFromDataURL(prev);
  };

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataURL = canvas.toDataURL("image/png");
    let arr: string[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) arr = parsed;
      }
    } catch {
      /* ignore */
    }
    arr.push(dataURL);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
    setGallery(arr);
  };

  const handleLoadFromGallery = (dataURL: string) => {
    restoreFromDataURL(dataURL);
    setTimeout(pushHistory, 50);
  };

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataURL = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = dataURL;
    a.download = `sketch-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const toolBtn = (t: Tool, label: string, testid: string) => (
    <button
      data-testid={testid}
      onClick={() => setTool(t)}
      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors border ${
        tool === t
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-foreground border-border hover:bg-accent"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card px-4 py-3">
        <h1 className="text-lg font-semibold tracking-tight">Sketchpad</h1>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-3">
        <div className="flex gap-2">
          {toolBtn("pen", "Pen", "tool-pen")}
          {toolBtn("eraser", "Eraser", "tool-eraser")}
          {toolBtn("line", "Line", "tool-line")}
          {toolBtn("rectangle", "Rectangle", "tool-rectangle")}
        </div>

        <div className="mx-2 h-6 w-px bg-border" />

        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Color</span>
          <input
            type="color"
            data-testid="color-picker"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-border bg-transparent"
          />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Size</span>
          <input
            type="range"
            data-testid="brush-size-slider"
            min={1}
            max={60}
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-32"
          />
          <span className="w-8 text-right tabular-nums">{brushSize}</span>
        </label>

        <div className="mx-2 h-6 w-px bg-border" />

        <button
          data-testid="undo-button"
          onClick={handleUndo}
          className="px-3 py-2 rounded-md text-sm font-medium border border-border bg-card hover:bg-accent"
        >
          Undo
        </button>
        <button
          data-testid="clear-canvas-button"
          onClick={handleClear}
          className="px-3 py-2 rounded-md text-sm font-medium border border-border bg-card hover:bg-accent"
        >
          Clear
        </button>
        <button
          data-testid="save-storage-button"
          onClick={handleSave}
          className="px-3 py-2 rounded-md text-sm font-medium border border-border bg-card hover:bg-accent"
        >
          Save
        </button>
        <button
          data-testid="export-png-button"
          onClick={handleExport}
          className="px-3 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90"
        >
          Export PNG
        </button>
      </div>

      <main className="flex flex-1 overflow-hidden">
        <section className="flex-1 p-4">
          <canvas
            ref={canvasRef}
            data-testid="drawing-canvas"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={endStroke}
            onMouseLeave={endStroke}
            className="w-full h-full bg-white shadow-md rounded-md cursor-crosshair border border-border"
          />
        </section>

        <aside className="w-64 border-l border-border bg-card p-4 overflow-y-auto">
          <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            Gallery
          </h2>
          <div data-testid="gallery-container" className="grid grid-cols-2 gap-2">
            {gallery.length === 0 && (
              <p className="col-span-2 text-xs text-muted-foreground">
                Saved drawings will appear here.
              </p>
            )}
            {gallery.map((src, i) => (
              <button
                key={i}
                data-testid={`gallery-item-${i}`}
                onClick={() => handleLoadFromGallery(src)}
                className="aspect-square overflow-hidden rounded border border-border hover:ring-2 hover:ring-primary transition"
                title={`Drawing ${i + 1}`}
              >
                <img src={src} alt={`Saved drawing ${i + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}
