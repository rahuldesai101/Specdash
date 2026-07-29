import { useEffect, useRef, useState } from "react";

/**
 * Footer telemetry: live frame rate + average frame time, sampled from
 * requestAnimationFrame. Updates state once per second so the meter itself
 * costs nothing measurable.
 */
export function PerfPill() {
  const [fps, setFps] = useState(60);
  const [ms, setMs] = useState(16);
  const frames = useRef(0);
  const last = useRef(0);

  useEffect(() => {
    let raf = 0;
    last.current = performance.now();
    const tick = (t: number) => {
      frames.current += 1;
      const dt = t - last.current;
      if (dt >= 1000) {
        const f = Math.round((frames.current * 1000) / dt);
        setFps(f);
        setMs(Math.round((dt / Math.max(1, frames.current)) * 10) / 10);
        frames.current = 0;
        last.current = t;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const tone = fps >= 50 ? "var(--t-green)" : fps >= 30 ? "var(--t-amber)" : "var(--t-orange)";
  return (
    <span
      className="inline-flex items-center border px-2 py-0.5 text-[9px] uppercase tracking-widest"
      style={{ borderColor: tone, color: tone }}
      title="Live render frame telemetry"
    >
      ⚡ {fps} FPS · {ms}MS RENDER
    </span>
  );
}