import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { onHotkey } from "@/lib/hotkeys";

let seq = 0;

/** Module-level SVG cache keyed by diagram source — survives remounts and mode toggles. */
const SVG_CACHE = new Map<string, string>();
/** Bounded LRU: an unbounded map leaked every diagram ever rendered. */
const SVG_CACHE_MAX = 40;

function cacheSvg(key: string, svg: string) {
  if (SVG_CACHE.has(key)) SVG_CACHE.delete(key);
  SVG_CACHE.set(key, svg);
  while (SVG_CACHE.size > SVG_CACHE_MAX) {
    const oldest = SVG_CACHE.keys().next().value;
    if (oldest === undefined) break;
    SVG_CACHE.delete(oldest);
  }
}

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
 *
 * Perf contract:
 *  - mermaid.render() runs ONCE per unique `chart` string (module cache).
 *  - pan/zoom mutate a CSS transform on a wrapper div imperatively — zero React
 *    re-renders while dragging or wheeling.
 *  - fullscreen + raw/visual toggles are CSS class swaps; the canvas node is
 *    never unmounted, so transform state and the injected SVG persist.
 */
function DiagramCanvasImpl({ chart, label = "MERMAID", raw, rawLang = "mermaid" }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const zoomLabel = useRef<HTMLSpanElement>(null);
  const viewport = useRef<HTMLDivElement>(null);

  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(() => SVG_CACHE.has(chart));
  const [mode, setMode] = useState<"visual" | "raw">("visual");
  const [full, setFull] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  // transform lives in a ref: mutating it never re-renders React
  const view = useRef({ x: 0, y: 0, z: 1 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  const applyTransform = useCallback(() => {
    const { x, y, z } = view.current;
    if (stage.current) stage.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${z})`;
    if (zoomLabel.current) zoomLabel.current.textContent = `${Math.round(z * 100)}%`;
  }, []);

  const setZoom = useCallback(
    (next: number, originX?: number, originY?: number) => {
      const z = Math.min(4, Math.max(0.3, +next.toFixed(2)));
      const prev = view.current.z;
      if (z === prev) return;
      if (originX !== undefined && originY !== undefined) {
        // keep the point under the cursor stable
        const k = z / prev;
        view.current.x = originX - (originX - view.current.x) * k;
        view.current.y = originY - (originY - view.current.y) * k;
      }
      view.current.z = z;
      applyTransform();
    },
    [applyTransform],
  );

  // ---- render mermaid ONCE per chart source ----------------------------------
  useEffect(() => {
    let cancelled = false;

    const inject = (svgText: string) => {
      if (cancelled || !host.current) return;
      host.current.innerHTML = svgText;
      setErr(null);
      setReady(true);
    };

    const cached = SVG_CACHE.get(chart);
    if (cached) {
      inject(cached);
      return () => {
        cancelled = true;
      };
    }

    setReady(false);
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
        cacheSvg(chart, out.svg);
        inject(out.svg);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "MERMAID_RENDER_ERR");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart]);

  // ---- node click → pathway trace (bound once per injected SVG) --------------
  useEffect(() => {
    const el = host.current;
    if (!el || !ready) return;
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
    applyTransform();
    return () => cleanups.forEach((c) => c());
  }, [ready, applyTransform]);

  // ---- highlight styling (only when the selection changes) ------------------
  useEffect(() => {
    const el = host.current;
    if (!el || !ready) return;
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
  }, [selected, ready]);

  // ---- pointer pan (imperative, no state writes) ----------------------------
  useEffect(() => {
    const vp = viewport.current;
    if (!vp) return;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      drag.current = { x: e.clientX, y: e.clientY, px: view.current.x, py: view.current.y };
      vp.setPointerCapture(e.pointerId);
      vp.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      view.current.x = d.px + (e.clientX - d.x);
      view.current.y = d.py + (e.clientY - d.y);
      applyTransform();
    };
    const stop = (e: PointerEvent) => {
      if (!drag.current) return;
      drag.current = null;
      try {
        vp.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
      vp.style.cursor = "grab";
    };
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = vp.getBoundingClientRect();
      setZoom(view.current.z - e.deltaY * 0.002, e.clientX - r.left, e.clientY - r.top);
    };

    vp.addEventListener("pointerdown", onDown);
    vp.addEventListener("pointermove", onMove);
    vp.addEventListener("pointerup", stop);
    vp.addEventListener("pointercancel", stop);
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      vp.removeEventListener("pointerdown", onDown);
      vp.removeEventListener("pointermove", onMove);
      vp.removeEventListener("pointerup", stop);
      vp.removeEventListener("pointercancel", stop);
      vp.removeEventListener("wheel", onWheel);
    };
  }, [applyTransform, setZoom]);

  // re-assert the transform after any structural re-render (fullscreen / mode)
  useLayoutEffect(() => {
    applyTransform();
  }, [applyTransform, full, mode, ready]);

  const reset = useCallback(() => {
    view.current = { x: 0, y: 0, z: 1 };
    applyTransform();
    setSelected(null);
  }, [applyTransform]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  // Alt+D toggles every mounted diagram between visual and raw source.
  useEffect(
    () => onHotkey("specToggleDiagram", () => setMode((m) => (m === "visual" ? "raw" : "visual"))),
    [],
  );

  const rawText = raw ?? chart;

  const ctl =
    "border border-[#333] px-2 py-1 text-[10px] uppercase tracking-widest text-[#888] hover:border-[#00ff66] hover:text-[#00ff66]";
  const on = { color: "#00ff66", borderColor: "#00ff66" } as const;

  return (
    <div
      className={
        full
          ? "fixed inset-0 z-[80] flex flex-col border border-hard bg-black p-0"
          : "flex flex-col border border-hard bg-[#050505]"
      }
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-hard px-2 py-2">
        <span className="mr-auto text-[9px] uppercase tracking-widest text-[#555]">[ DIAGRAM: {label} ]</span>
        <button className={ctl} onClick={() => setMode("visual")} style={mode === "visual" ? on : undefined}>
          📊 VISUAL
        </button>
        <button className={ctl} onClick={() => setMode("raw")} style={mode === "raw" ? on : undefined}>
          💻 RAW CODE
        </button>
        {mode === "visual" && (
          <>
            <button className={ctl} onClick={() => setZoom(view.current.z + 0.2)}>+</button>
            <button className={ctl} onClick={() => setZoom(view.current.z - 0.2)}>−</button>
            <button className={ctl} onClick={reset}>RESET ZOOM</button>
            <span ref={zoomLabel} className="px-1 text-[9px] text-[#444]">100%</span>
            <button className={ctl} onClick={() => setFull((v) => !v)}>{full ? "⛶ CLOSE" : "⛶ EXPAND"}</button>
          </>
        )}
      </div>

      {err && (
        <pre className="border-b border-[#ff5500] p-3 text-[10px] whitespace-pre-wrap text-[#ff5500]">
          {`> DIAGRAM_ERR: ${err}`}
        </pre>
      )}

      {/* RAW pane — hidden, never unmounted */}
      <pre
        className={`overflow-auto bg-[#050505] p-3 text-[11px] text-[#ccc] ${
          mode === "raw" ? (full ? "flex-1" : "max-h-[60vh]") : "hidden"
        }`}
      >
        <div className="mb-2 text-[9px] uppercase tracking-widest text-[#555]">[ SOURCE: {rawLang} ]</div>
        <code className="whitespace-pre">{rawText}</code>
      </pre>

      {/* VISUAL canvas — hidden via CSS so transform + SVG survive every toggle */}
      <div
        ref={viewport}
        className={`relative overflow-hidden bg-[#050505] select-none ${
          mode === "visual" ? (full ? "flex-1" : "h-[380px]") : "hidden"
        }`}
        style={{ cursor: "grab", touchAction: "none" }}
      >
        <div
          ref={stage}
          className="origin-top-left p-4 will-change-transform [&_svg]:max-w-none [&_svg]:h-auto"
        >
          <div ref={host} />
        </div>
        {!ready && !err && (
          <div className="absolute left-3 top-3 text-[10px] uppercase tracking-widest text-[#555]">
            &gt; COMPILING_DIAGRAM...
          </div>
        )}
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
    </div>
  );
}

/** Identical props (same diagram source) must never remount the canvas. */
export const DiagramCanvas = memo(
  DiagramCanvasImpl,
  (a, b) => a.chart === b.chart && a.raw === b.raw && a.label === b.label && a.rawLang === b.rawLang,
);
