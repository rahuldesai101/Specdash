import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { IndexState } from "@/hooks/use-search-index";
import type { SearchHit } from "@/lib/search-worker-types";
import { toast } from "sonner";
import {
  CONTEXT_WINDOW,
  PACK_TARGETS,
  fmtTokens,
  packContext,
  tokensOf,
  type PackTarget,
} from "@/lib/context-pack";
import { PromptShelf, type ShelfContext } from "@/components/ai/PromptShelf";
import type { PromptPreset } from "@/lib/prompt-presets";

type Filter = "all" | "spec" | "agent" | "snippet" | "prompts";

const TABS: { id: Filter; label: string }[] = [
  { id: "all", label: "[ ALL ]" },
  { id: "spec", label: "[ 📄 SPECS ]" },
  { id: "agent", label: "[ 🤖 AGENT RULES ]" },
  { id: "snippet", label: "[ ⚡ CODE SNIPPETS ]" },
  { id: "prompts", label: "[ ⚡ SAVED PROMPTS ]" },
];

type Hit = SearchHit;

export function SearchModal({
  state,
  onClose,
  onOpen,
  onRunSnippet,
  repoLabel = "repo",
  initialPack = false,
  initialTab,
  extraFiles = [],
  shelfCtx = {},
  onRunPreset,
}: {
  state: IndexState;
  onClose: () => void;
  onOpen: (path: string) => void;
  onRunSnippet?: (code: string, lang: string, path: string) => void;
  repoLabel?: string;
  initialPack?: boolean;
  /** Open straight onto a tab (e.g. the saved-prompt shelf). */
  initialTab?: Filter;
  /** Ad-hoc selections captured from the floating action bar. */
  extraFiles?: { path: string; content: string }[];
  shelfCtx?: ShelfContext;
  onRunPreset?: (prompt: string, preset: PromptPreset) => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>(initialTab ?? "all");
  const [cursor, setCursor] = useState(0);
  const [packMode, setPackMode] = useState(initialPack);
  const [picked, setPicked] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Keystrokes stay on the high-priority lane: querying, ranking AND snippet
  // highlighting happen inside the search worker, debounced by 150ms.
  const search = state.search;
  useEffect(() => {
    if (filter === "prompts") return;
    let alive = true;
    const t = setTimeout(() => {
      void search(q, filter).then((r) => alive && setHits(r));
    }, 150);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, filter, search, state.docCount]);

  useEffect(() => setCursor(0), [q, filter]);

  const counts = state.counts;

  const togglePick = useCallback(
    (path: string) => setPicked((p) => (p.includes(path) ? p.filter((x) => x !== path) : [...p, path])),
    [],
  );

  const activate = useCallback(
    (h: Hit) => {
      if (packMode) {
        togglePick(h.path);
        return;
      }
      if (h.kind === "snippet" && onRunSnippet) {
        onRunSnippet(h.content, h.lang ?? "text", h.path);
        onClose();
        return;
      }
      onOpen(h.path);
    },
    [packMode, togglePick, onRunSnippet, onOpen, onClose],
  );

  const byPath = useMemo(() => new Map(Object.entries(state.contents)), [state.contents]);

  const packFiles = useMemo(
    () => [...extraFiles, ...picked.map((p) => ({ path: p, content: byPath.get(p) ?? "" }))],
    [picked, byPath, extraFiles],
  );

  const rows = useVirtualizer({
    count: hits.length,
    getScrollElement: () => listRef.current,
    // Deterministic row heights (single-line truncated rows) keep scrolling
    // jank-free without a measurement pass.
    estimateSize: () => 86,
    overscan: 8,
  });

  // Row heights depend on each hit's snippet/heading lines, so recompute the
  // offset map whenever a new result set arrives.
  useEffect(() => {
    rows.measure();
  }, [hits, rows]);
  const packTokens = useMemo(
    () => packFiles.reduce((n, f) => n + tokensOf(f.content), 0),
    [packFiles],
  );
  const packPct = (packTokens / CONTEXT_WINDOW) * 100;

  const copyPack = async (target: PackTarget) => {
    if (!packFiles.length) return;
    try {
      await navigator.clipboard.writeText(packContext(target, repoLabel, packFiles));
      toast.success(`PACKED_CONTEXT_COPIED → ${target.toUpperCase()} (${fmtTokens(packTokens)} tokens)`);
    } catch {
      toast.error("CLIPBOARD_BLOCKED");
    }
  };

  const pct = state.total ? Math.round((state.loaded / state.total) * 100) : 100;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/85 p-3 pt-[7vh]"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[82vh] w-full max-w-3xl flex-col border border-hard bg-black"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hard px-4 py-3">
          <div className="text-[12px] uppercase tracking-widest text-[#00ff66]">
            [ FULL_TEXT_SEARCH // CTRL+K ]
          </div>
          <button onClick={onClose} className="text-[11px] text-[#666] hover:text-white">
            [ESC]
          </button>
        </div>

        <div className="border-b border-hard px-4 py-3">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, hits.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              }
              if (e.key === "Enter" && hits[cursor]) {
                e.preventDefault();
                activate(hits[cursor]);
              }
            }}
            placeholder="fuzzy + prefix search across names, paths, headings, tags and body text…"
            className="w-full border border-hard bg-black px-2 py-2 text-[12px] text-white outline-none focus:border-[#00ff66]"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                className="border px-2 py-1 text-[10px] uppercase tracking-widest"
                style={{
                  borderColor: filter === t.id ? "#00ff66" : "#333",
                  color: filter === t.id ? "#00ff66" : "#888",
                }}
              >
                {t.label} {t.id === "prompts" ? "" : String(counts[t.id]).padStart(2, "0")}
              </button>
            ))}
            <button
              onClick={() => setPackMode((v) => !v)}
              className="border px-2 py-1 text-[10px] uppercase tracking-widest"
              style={{
                borderColor: packMode ? "#ff5500" : "#333",
                color: packMode ? "#ff5500" : "#888",
              }}
            >
              [ 🎒 PACK CONTEXT WINDOW ]
            </button>
            <span className="ml-auto text-[10px] uppercase tracking-widest" style={{ color: state.ready ? "#00ff66" : "#ffaa00" }}>
              [ INDEX: {state.ready ? "READY" : `${pct}%`} · {state.docCount} DOCS · WORKER ]
            </span>
          </div>
        </div>

        {packMode && filter !== "prompts" && (
          <div className="border-b border-hard px-4 py-2 text-[10px] uppercase tracking-widest">
            <div className="flex flex-wrap items-center gap-2">
              <span style={{ color: packPct > 100 ? "#ff5500" : "#00ff66" }}>
                [ {packTokens.toLocaleString()} / {CONTEXT_WINDOW.toLocaleString()} TOKENS ({packPct.toFixed(1)}%) ·{" "}
                {packFiles.length} FILES ]
              </span>
              <button onClick={() => setPicked([])} className="border border-[#333] px-2 py-1 text-[#888] hover:text-white">
                CLEAR
              </button>
              <span className="ml-auto flex flex-wrap gap-2">
                {PACK_TARGETS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => copyPack(t.id)}
                    disabled={!picked.length}
                    className="border border-[#00ff66] px-2 py-1 text-[#00ff66] hover:bg-[#00ff66] hover:text-black disabled:opacity-30"
                  >
                    📋 COPY → {t.label}
                  </button>
                ))}
              </span>
            </div>
            <div className="mt-2 h-1 w-full bg-[#111]">
              <div
                className="h-1"
                style={{
                  width: `${Math.min(100, packPct)}%`,
                  backgroundColor: packPct > 100 ? "#ff5500" : packPct > 60 ? "#ffaa00" : "#00ff66",
                }}
              />
            </div>
          </div>
        )}

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-3 text-[11px]">
          {filter === "prompts" ? (
            <PromptShelf ctx={shelfCtx} onRun={onRunPreset} />
          ) : (
          <>
          {hits.length === 0 && (
            <div className="px-2 py-6 text-center text-[11px] uppercase tracking-widest text-[#555]">
              &gt; NO_MATCHES
            </div>
          )}
          <div className="relative w-full" style={{ height: hits.length ? rows.getTotalSize() : 0 }}>
          {rows.getVirtualItems().map((row) => {
            const h = hits[row.index];
            const i = row.index;
            const segs = h.segs;
            const active = i === cursor;
            const checked = picked.includes(h.path);
            return (
              <button
                key={h.id}
                data-index={i}
                onMouseEnter={() => setCursor(i)}
                onClick={() => activate(h)}
                className="absolute left-0 top-0 block w-full overflow-hidden border px-2 py-1.5 text-left"
                style={{
                  transform: `translateY(${row.start}px)`,
                  height: row.size - 4,
                  borderColor: checked ? "#ff5500" : active ? "#00ff66" : "#1a1a1a",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] text-white">
                    {packMode && <span className="text-[#ff5500]">{checked ? "[x]" : "[ ]"} </span>}
                    {h.kind === "snippet" ? "⚡" : h.kind === "agent" ? "🤖" : h.kind === "data" ? "🧮" : "📄"}{" "}
                    {h.name}
                  </span>
                  <span className="shrink-0 text-[9px] uppercase tracking-widest text-[#555]">
                    {h.kind === "snippet" ? `RUN ${h.lang}` : `~${fmtTokens(h.tokens)} tok · /${h.dir}`}
                  </span>
                </div>
                <div className="truncate text-[10px] text-[#666]">/{h.path}</div>
                {segs.length > 0 && (
                  <div className="mt-1 truncate text-[11px] text-[#999]">
                    {segs.map((s, k) =>
                      s.hit ? (
                        <mark key={k} className="bg-[#00ffcc] text-black">
                          {s.text}
                        </mark>
                      ) : (
                        <span key={k}>{s.text}</span>
                      ),
                    )}
                  </div>
                )}
                {h.headings && (
                  <div className="mt-1 truncate text-[9px] uppercase tracking-widest text-[#444]">
                    § {h.headings}
                  </div>
                )}
              </button>
            );
          })}
          </div>
          </>
          )}
        </div>

        <div className="border-t border-hard px-4 py-2 text-[9px] uppercase tracking-widest text-[#555]">
          {filter === "prompts"
            ? "MUSTACHE {{VARIABLES}} AUTO-FILL FROM THE OPEN SPEC · SAVED LOCALLY"
            : `↑↓ NAVIGATE · ENTER ${packMode ? "TOGGLE FILE" : "OPEN"} · SNIPPET HITS LAUNCH THE PLAYGROUND`}
        </div>
      </div>
    </div>
  );
}