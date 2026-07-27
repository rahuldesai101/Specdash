import { useEffect, useRef, useState } from "react";

let seq = 0;

export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

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
        const { svg } = await mermaid.render(`mmd-${++seq}-${Date.now()}`, chart);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
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

  if (err) {
    return (
      <pre className="border border-[#ff5500] text-[#ff5500] p-3 text-[10px] whitespace-pre-wrap overflow-auto">
        {`> MERMAID_ERR: ${err}\n\n${chart}`}
      </pre>
    );
  }

  return (
    <div className="border border-hard bg-[#050505] p-3 overflow-auto">
      <div className="text-[9px] uppercase tracking-widest text-[#555] mb-2">[ DIAGRAM: MERMAID ]</div>
      <div ref={ref} className="[&_svg]:max-w-full [&_svg]:h-auto" />
    </div>
  );
}
