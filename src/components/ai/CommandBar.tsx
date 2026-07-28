import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { streamBudgeted, TOO_LARGE_MESSAGE, type AiConfig } from "@/lib/ai-engine";
import { normalizeAiMarkdown } from "@/lib/md-normalize";
import { buildRepoManifest, DEFAULT_BUDGET, TokenLimitError } from "@/lib/token-budget";

export type IndexedRecord = { path: string; dir: string; name: string; excerpt?: string };

export function CommandBar({
  cfg,
  index,
  onClose,
  onOpen,
}: {
  cfg: AiConfig | null;
  index: IndexedRecord[];
  onClose: () => void;
  onOpen: (path: string) => void;
}) {
  const [q, setQ] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    return () => abortRef.current?.abort();
  }, []);

  const localHits = useMemo(() => {
    const t = q.toLowerCase().trim();
    if (!t) return [];
    return index
      .filter((r) => r.path.toLowerCase().includes(t) || (r.excerpt ?? "").toLowerCase().includes(t))
      .slice(0, 6);
  }, [q, index]);

  const cited = useMemo(
    () => index.filter((r) => out.includes(r.path)).slice(0, 12),
    [out, index],
  );

  const run = async () => {
    if (!cfg) {
      setErr("AI_DISABLED — configure an engine first");
      return;
    }
    if (!q.trim() || busy) return;
    setBusy(true);
    setErr(null);
    setOut("");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      await streamBudgeted(
        cfg,
        "You are a concise engineering assistant. Output ONLY a raw JSON array of file path strings. " +
          "No markdown, no code fences, no backticks, no prose, no explanation.",
        (budget) =>
          `Given this repo file index (path | folder | headings):\n${buildRepoManifest(index, budget - q.length - 200)}\n\nIdentify which 3 file paths best answer the query: ${q}\nOutput JSON array of paths only.`,
        (d) => setOut((p) => p + d),
        ctrl.signal,
        DEFAULT_BUDGET,
      );
    } catch (e) {
      if (ctrl.signal.aborted) return;
      if (e instanceof TokenLimitError) {
        toast.error(TOO_LARGE_MESSAGE);
        setErr(TOO_LARGE_MESSAGE);
      } else {
        setErr(e instanceof Error ? e.message : "AI_ERR");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/85 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        className="w-full max-w-2xl bg-black border border-hard flex flex-col max-h-[80vh]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hard px-4 py-3">
          <div className="text-[12px] uppercase tracking-widest text-[#00ff66]">[ SEMANTIC_QUERY // CTRL+K ]</div>
          <button onClick={onClose} className="text-[#666] hover:text-white text-[11px]">
            [ESC]
          </button>
        </div>

        <div className="border-b border-hard px-4 py-3">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") run();
              if (e.key === "Escape") onClose();
            }}
            placeholder="find benchmark specs with memory leaks..."
            className="w-full bg-black border border-hard px-2 py-2 text-[12px] text-white outline-none focus:border-[#00ff66]"
          />
          <div className="mt-2 flex items-center gap-3 text-[10px] uppercase tracking-widest text-[#666]">
            <button
              onClick={run}
              disabled={busy}
              className="border border-[#00ff66] text-[#00ff66] px-2 py-1 hover:bg-[#00ff66] hover:text-black disabled:opacity-40"
            >
              {busy ? "[ STREAMING... ]" : "[ RUN_QUERY ]"}
            </button>
            <span>[ RECORDS_INDEXED: {String(index.length).padStart(4, "0")} ]</span>
            {cfg ? <span className="text-[#00ff66]">[ ENGINE: {cfg.provider.toUpperCase()} ]</span> : <span className="text-[#ff5500]">[ AI: DISABLED ]</span>}
          </div>
        </div>

        <div className="overflow-auto p-4 space-y-4 text-[11px]">
          {err && <div className="text-[#ff5500] break-all">ERR: {err}</div>}

          {localHits.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#666] mb-2">&gt; LOCAL_GREP</div>
              {localHits.map((r) => (
                <button
                  key={r.path}
                  onClick={() => onOpen(r.path)}
                  className="block w-full text-left border border-hard px-2 py-1 mb-1 text-[#888] hover:border-[#00ff66] hover:text-[#00ff66]"
                >
                  /{r.path}
                </button>
              ))}
            </div>
          )}

          {out && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#666] mb-2">&gt; AI_RESPONSE</div>
              <pre className="whitespace-pre-wrap text-[#ccc]">{normalizeAiMarkdown(out)}</pre>
            </div>
          )}

          {cited.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#666] mb-2">&gt; DEEP_LINKS</div>
              {cited.map((r) => (
                <button
                  key={r.path}
                  onClick={() => onOpen(r.path)}
                  className="block w-full text-left border border-[#00ff66] text-[#00ff66] px-2 py-1 mb-1 hover:bg-[#00ff66] hover:text-black"
                >
                  &gt; OPEN /{r.path}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
