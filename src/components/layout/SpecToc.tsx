import { useMemo } from "react";
import { slugify } from "@/lib/path-resolve";

export type Heading = { level: number; text: string; id: string };

export function parseHeadings(md: string): Heading[] {
  const out: Heading[] = [];
  let fence = false;
  for (const line of md.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const m = /^(#{1,3})\s+(.*)$/.exec(line);
    if (!m) continue;
    const text = m[2].replace(/[#*`_]/g, "").trim();
    if (!text) continue;
    out.push({ level: m[1].length, text, id: slugify(text) });
  }
  return out;
}

export function SpecToc({ source, className = "" }: { source: string; className?: string }) {
  const headings = useMemo(() => parseHeadings(source), [source]);
  if (headings.length < 2) return null;
  const go = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <nav className={className} aria-label="Table of contents">
      <div className="text-[10px] uppercase tracking-widest text-[var(--t-dim-2)] mb-2">[ TOC ]</div>
      <ul className="space-y-1">
        {headings.map((h, i) => (
          <li key={`${h.id}-${i}`} style={{ paddingLeft: (h.level - 1) * 10 }}>
            <button
              onClick={() => go(h.id)}
              className="text-left w-full text-[11px] leading-5 text-[var(--t-dim)] hover:text-[var(--t-green)] truncate"
              title={h.text}
            >
              {h.level === 1 ? "# " : h.level === 2 ? "## " : "### "}
              {h.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
