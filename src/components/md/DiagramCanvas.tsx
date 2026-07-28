import { useCallback, useEffect, useRef, useState } from "react";

let seq = 0;

type Props = {
  chart: string;
  label?: string;
  /** Original source shown in the RAW CODE tab (defaults to the mermaid chart). */
  raw?: string;
  rawLang?: string;
};

/**
 * Interactive agent-graph canvas: mermaid SVG + zoom / pan / fullscreen,
 * node-click pathway highlighting and a visual|raw toggle.
 */
export function DiagramCanvas({ chart, label = "MERMAID", raw, rawLang = "mermaid" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [mode, setMode] = useState<"visual" | "raw">("visual");
  const [full, setFull] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "strict",
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
          themeVariables: {
            background: "#000000",
            primaryColor: "#0a0a0a",
            primaryTextColor: "#ffffff",
            primaryBorderColor: "#00ff66",
            lineColor: "#00ff66",
            secondaryColor: "#111111",
            tertiaryColor: "#111111",
          },
        });
        const out = await mermaid.render(`mmd-${++seq}-${Date.now()}`, chart);
        if (!cancelled) {
          setSvg(out.svg);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "MERMAID_RENDER_ERR");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart]);

  // Inject SVG + wire node click → pathway highlight
  useEffect(() => {
    const el = host.current;
    if (!el || !svg || mode !== "visual") return;
    el.innerHTML = svg;
    const nodes = Array.from(el.querySelectorAll<SVGGElement>("g.node, .node"));
    const cleanups: Array<() => void> = [];
    nodes.forEach((n) => {
      n.style.cursor = "pointer";
      const onClick = (ev: Event) => {
        ev.stopPropagation();
        setSelected((prev) => (prev === n.id ? null : n.id));
      };
      n.addEventListener("click", onClick);
      cleanups.push(() => n.removeEventListener("click", onClick));
    });
    return () => cleanups.forEach((c) => c());
  }, [svg, mode, full]);

  // Apply highlight styling
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const nodes = Array.from(el.querySelectorAll<SVGGElement>("g.node, .node"));
    const edges = Array.from(el.querySelectorAll<SVGElement>("path.flowchart-link, .edgePath path, .messageLine0"));
    if (!selected) {
      [...nodes, ...edges].forEach((n) => {
        n.style.opacity = "1";
        n.style.filter = "";
      });
      return;
    }
    const key = selected.replace(/^flowchart-/, "").split("-")[0];
    const related = new Set<string>([selected]);
    edges.forEach((e) => {
      const cls = e.getAttribute("class") ?? "";
      const hit = cls.includes(`LS-${key}`) || cls.includes(`LE-${key}`) || cls.includes(key);
      e.style.opacity = hit ? "1" : "0.12";
      if (hit) {
        e.style.filter = "drop-shadow(0 0 3px #00ff66)";
        cls
          .split(/\s+/)
          .filter((c) => c.startsWith("LS-") || c.startsWith("LE-"))
          .forEach((c) => related.add(c.slice(3)));
      } else e.style.filter = "";
    });
    nodes.forEach((n) => {
      const nkey = n.id.replace(/^flowchart-/, "").split("-")[0];
      const on = n.id === selected || related.has(nkey);
      n.style.opacity = on ? "1" : "0.2";
      n.style.filter = n.id === selected ? "drop-shadow(0 0 6px #00ff66)" : "";
    });
  }, [selected, svg, mode, full]);

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSelected(null);
  }, []);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  const rawText = raw ?? chart;

  if (err) {
    return (
      <pre className="border border-[#ff5500] p-3 text-[10px] whitespace-pre-wrap overflow-auto text-[#ff5500]">
        {`> DIAGRAM_ERR: ${err}\n\n${rawText}`}
      </pre>
    );
  }

  const ctl =
    "border border-[#333] px-2 py-1 text-[10px] uppercase tracking-widest text-[#888] hover:border-[#00ff66] hover:text-[#00ff66]";

  const body = (
    <div className={`flex flex-col ${full ? "h-full" : ""}`}>
      <div className="flex flex-wrap items-center gap-1 border-b border-hard px-2 py-2">
        <span className="mr-auto text-[9px] uppercase tracking-widest text-[#555]">[ DIAGRAM: {label} ]</span>
        <button className={ctl} onClick={() => setMode("visual")} style={mode === "visual" ? { color: "#00ff66", borderColor: "#00ff66" } : undefined}>
          📊 VISUAL
        </button>
        <button className={ctl} onClick={() => setMode("raw")} style={mode === "raw" ? { color: "#00ff66", borderColor: "#00ff66" } : undefined}>
          💻 RAW CODE
        </button>
        {mode === "visual" && (
          <>
            <button className={ctl} onClick={() => setZoom((z) => Math.min(4, +(z + 0.2).toFixed(2)))}>+</button>
            <button className={ctl} onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.2).toFixed(2)))}>−</button>
            <button className={ctl} onClick={reset}>RESET ZOOM</button>
            <span className="px-1 text-[9px] text-[#444]">{Math.round(zoom * 100)}%</span>
            <button className={ctl} onClick={() => setFull((v) => !v)}>{full ? "⛶ CLOSE" : "⛶ EXPAND"}</button>
          </>
        )}
      </div>

      {mode === "raw" ? (
        <pre className={`overflow-auto bg-[#050505] p-3 text-[11px] text-[#ccc] ${full ? "flex-1" : "max-h-[60vh]"}`}>
          <div className="mb-2 text-[9px] uppercase tracking-widest text-[#555]">[ SOURCE: {rawLang} ]</div>
          <code className="whitespace-pre">{rawText}</code>
        </pre>
      ) : (
        <div
          className={`relative overflow-hidden bg-[#050505] ${full ? "flex-1" : "h-[380px]"}`}
          onMouseDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          }}
          onMouseMove={(e) => {
            const d = drag.current;
            if (!d) return;
            setPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) });
          }}
          onMouseUp={() => (drag.current = null)}
          onMouseLeave={() => (drag.current = null)}
          onWheel={(e) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            setZoom((z) => Math.min(4, Math.max(0.3, +(z - e.deltaY * 0.002).toFixed(2))));
          }}
          style={{ cursor: drag.current ? "grabbing" : "grab" }}
        >
          <div
            ref={host}
            className="origin-top-left p-4 [&_svg]:max-w-none [&_svg]:h-auto"
            style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
          />
          {selected && (
            <button
              onClick={() => setSelected(null)}
              className="absolute bottom-2 right-2 border border-[#00ff66] bg-black px-2 py-1 text-[9px] uppercase tracking-widest text-[#00ff66]"
            >
              [ CLEAR_PATHWAY ]
            </button>
          )}
          <div className="pointer-events-none absolute bottom-2 left-2 text-[9px] uppercase tracking-widest text-[#333]">
            drag to pan · ctrl+wheel to zoom · click node to trace
          </div>
        </div>
      )}
    </div>
  );

  if (full) {
    return (
      <div className="fixed inset-0 z-[80] bg-black/95 p-3 sm:p-6">
        <div className="h-full border border-hard bg-black">{body}</div>
      </div>
    );
  }
  return <div className="border border-hard bg-[#050505]">{body}</div>;
}
