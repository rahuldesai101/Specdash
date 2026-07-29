import { useMemo, useState } from "react";
import { toast } from "sonner";
import { cellText, parseDataset, toCsv, type DatasetRow } from "@/lib/dataset";

const btn =
  "min-h-9 inline-flex items-center justify-center border border-[var(--t-line)] px-3 text-[10px] uppercase tracking-widest hover:border-[var(--t-green)] hover:text-[var(--t-green)] disabled:opacity-30 disabled:hover:border-[var(--t-line)] disabled:hover:text-[var(--t-fg)]";

const PAGE_SIZES = [25, 50, 100, 250];

function pick(row: DatasetRow, keys: string[]): { key: string; value: string } | null {
  for (const k of Object.keys(row)) {
    if (keys.includes(k.toLowerCase())) return { key: k, value: cellText(row[k]) };
  }
  return null;
}

export function DatasetInspector({ path, text }: { path: string; text: string }) {
  const parsed = useMemo(() => parseDataset(path, text), [path, text]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [cards, setCards] = useState(true);

  const filtered = useMemo(() => {
    if (!parsed) return [];
    const needle = q.trim().toLowerCase();
    let out = parsed.rows;
    if (needle) {
      out = out.filter((r) => parsed.columns.some((c) => cellText(r[c]).toLowerCase().includes(needle)));
    }
    if (sort) {
      const { col, dir } = sort;
      out = [...out].sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        const an = typeof av === "number" ? av : Number(cellText(av));
        const bn = typeof bv === "number" ? bv : Number(cellText(bv));
        if (!Number.isNaN(an) && !Number.isNaN(bn) && cellText(av) !== "" && cellText(bv) !== "")
          return (an - bn) * dir;
        return cellText(av).localeCompare(cellText(bv)) * dir;
      });
    }
    return out;
  }, [parsed, q, sort]);

  if (!parsed) {
    return (
      <pre className="overflow-auto border border-hard bg-[var(--t-surface)] p-3 text-[11px] whitespace-pre text-[var(--t-fg-2)]">
        {text}
      </pre>
    );
  }

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pages - 1);
  const start = safePage * pageSize;
  const slice = filtered.slice(start, start + pageSize);
  const pairMode = parsed.pairs && cards;

  const copy = async (value: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(msg);
    } catch {
      toast.error("CLIPBOARD_BLOCKED");
    }
  };

  const exportCsv = () => {
    const blob = new Blob([toCsv(parsed.columns, filtered)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "dataset"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("CSV_EXPORTED");
  };

  return (
    <div className="border border-hard bg-[var(--t-surface)]">
      {/* TOOLBAR */}
      <div className="flex flex-wrap items-center gap-2 border-b border-hard px-3 py-2">
        <span className="text-[10px] uppercase tracking-widest text-[var(--t-green)]">
          [ DATASET_INSPECTOR // {parsed.kind.toUpperCase()} ]
        </span>
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="SEARCH_ROWS..."
          className="min-h-9 flex-1 min-w-[160px] border border-[var(--t-line)] bg-[var(--t-bg)] px-2 text-[11px] text-[var(--t-fg)] placeholder:text-[var(--t-dim-3)] focus:border-[var(--t-green)] focus:outline-none"
        />
        <span className="border border-[var(--t-line)] px-2 py-1 text-[10px] tracking-widest text-[var(--t-dim)]">
          {total ? `VIEWING ${start + 1}-${Math.min(start + pageSize, total)} OF ${total.toLocaleString()} ROWS` : "0 ROWS"}
        </span>
        {parsed.pairs && (
          <button onClick={() => setCards((c) => !c)} className={btn}>
            {cards ? "▦ TABLE VIEW" : "🗂 PAIR CARDS"}
          </button>
        )}
        <button onClick={exportCsv} className={btn}>
          📥 EXPORT CSV
        </button>
        <button onClick={() => copy(JSON.stringify(filtered, null, 2), "JSON_COPIED")} className={btn}>
          📋 COPY JSON
        </button>
      </div>

      {parsed.errors.length > 0 && (
        <div className="border-b border-hard px-3 py-1 text-[10px] text-[var(--t-amber)]">
          PARSE_WARN: {parsed.errors.join(" | ")}
        </div>
      )}

      {/* BODY */}
      {pairMode ? (
        <div className="space-y-3 p-3">
          {slice.map((r, i) => {
            const inp = pick(r, ["prompt", "input", "question", "instruction"]);
            const out = pick(r, ["completion", "output", "response", "answer", "expected"]);
            const score = pick(r, ["eval_score", "score", "rating", "grade"]);
            const rest = parsed.columns.filter(
              (c) => ![inp?.key, out?.key, score?.key].includes(c),
            );
            return (
              <div key={start + i} className="border border-hard">
                <div className="flex items-center justify-between border-b border-hard px-2 py-1 text-[10px] tracking-widest text-[var(--t-dim-2)]">
                  <span>ROW_{start + i + 1}</span>
                  {score && (
                    <span className="text-[var(--t-green)]">
                      {score.key.toUpperCase()}: {score.value}
                    </span>
                  )}
                </div>
                {inp && (
                  <div className="border-b border-hard p-2">
                    <div className="mb-1 text-[10px] tracking-widest text-[var(--t-green)]">▸ {inp.key.toUpperCase()}</div>
                    <pre className="whitespace-pre-wrap text-[12px] leading-6 text-[var(--t-fg-2)]">{inp.value}</pre>
                  </div>
                )}
                {out && (
                  <div className="p-2">
                    <div className="mb-1 text-[10px] tracking-widest text-[var(--t-dim)]">▸ {out.key.toUpperCase()}</div>
                    <pre className="whitespace-pre-wrap text-[12px] leading-6 text-[var(--t-fg-2)]">{out.value}</pre>
                  </div>
                )}
                {rest.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t border-hard px-2 py-1 text-[10px] text-[var(--t-dim-2)]">
                    {rest.map((c) => (
                      <span key={c}>
                        {c}=<span className="text-[var(--t-dim)]">{cellText(r[c]).slice(0, 60)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {!slice.length && <div className="p-4 text-[11px] text-[var(--t-dim-2)]">NO_MATCHING_ROWS</div>}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-hard bg-[var(--t-bg)]">
                <th className="px-2 py-2 text-left text-[10px] tracking-widest text-[var(--t-line)]">#</th>
                {parsed.columns.map((c) => {
                  const active = sort?.col === c;
                  return (
                    <th key={c} className="border-l border-hard px-2 py-2 text-left">
                      <button
                        onClick={() =>
                          setSort(active && sort!.dir === 1 ? { col: c, dir: -1 } : active && sort!.dir === -1 ? null : { col: c, dir: 1 })
                        }
                        className={`text-[10px] uppercase tracking-widest ${active ? "text-[var(--t-green)]" : "text-[var(--t-dim)]"} hover:text-[var(--t-green)]`}
                      >
                        {c} {active ? (sort!.dir === 1 ? "▲" : "▼") : "↕"}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {slice.map((r, i) => (
                <tr key={start + i} className="border-b border-[var(--t-surface-2)] align-top hover:bg-[var(--t-surface-2)]">
                  <td className="px-2 py-1 text-[10px] text-[var(--t-line)]">{start + i + 1}</td>
                  {parsed.columns.map((c) => (
                    <td key={c} className="max-w-[380px] border-l border-[var(--t-surface-2)] px-2 py-1 text-[var(--t-fg-2)]">
                      <div className="line-clamp-4 whitespace-pre-wrap break-words">{cellText(r[c])}</div>
                    </td>
                  ))}
                </tr>
              ))}
              {!slice.length && (
                <tr>
                  <td colSpan={parsed.columns.length + 1} className="p-4 text-[11px] text-[var(--t-dim-2)]">
                    NO_MATCHING_ROWS
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* PAGINATION */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hard px-3 py-2">
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(0)} disabled={safePage === 0} className={btn}>
            ⏮ FIRST
          </button>
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className={btn}>
            [ PREV ]
          </button>
          <span className="text-[10px] tracking-widest text-[var(--t-dim)]">
            PAGE {safePage + 1} OF {pages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={safePage >= pages - 1}
            className={btn}
          >
            [ NEXT ]
          </button>
          <button onClick={() => setPage(pages - 1)} disabled={safePage >= pages - 1} className={btn}>
            LAST ⏭
          </button>
        </div>
        <div className="flex items-center gap-2 text-[10px] tracking-widest text-[var(--t-dim-2)]">
          ROWS/PAGE
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(0);
            }}
            className="min-h-9 border border-[var(--t-line)] bg-[var(--t-bg)] px-2 text-[11px] text-[var(--t-fg)] focus:border-[var(--t-green)] focus:outline-none"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
