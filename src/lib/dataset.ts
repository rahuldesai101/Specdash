import Papa from "papaparse";

/** Dataset interception: .csv / .tsv / .jsonl / .json (array) files render as a data grid. */

export type DatasetKind = "csv" | "tsv" | "jsonl" | "json";

export type DatasetRow = Record<string, unknown>;

export type ParsedDataset = {
  kind: DatasetKind;
  columns: string[];
  rows: DatasetRow[];
  /** true when rows look like prompt/completion eval pairs */
  pairs: boolean;
  errors: string[];
};

const DATA_DIR_RE = /(^|\/)(data|datasets?|evals?|eval_?sets?|benchmarks?|research|fixtures|samples?|results?)(\/|$)/i;

export function datasetKind(path: string): DatasetKind | null {
  const p = path.toLowerCase();
  if (p.endsWith(".csv")) return "csv";
  if (p.endsWith(".tsv")) return "tsv";
  if (p.endsWith(".jsonl") || p.endsWith(".ndjson") || p.endsWith(".eval")) return "jsonl";
  if (p.endsWith(".json")) return "json";
  return null;
}

/** Files we index from the repo tree as datasets. */
export function isDatasetPath(path: string): boolean {
  const kind = datasetKind(path);
  if (!kind) return false;
  // json is noisy (package.json, tsconfig) — only inside dataset-ish dirs
  if (kind === "json") return DATA_DIR_RE.test(path);
  return true;
}

const PAIR_KEYS = ["prompt", "completion", "input", "output", "response", "question", "answer", "expected", "eval_score", "score"];

function isPairShape(cols: string[]): boolean {
  const set = new Set(cols.map((c) => c.toLowerCase()));
  const hasIn = ["prompt", "input", "question", "instruction"].some((k) => set.has(k));
  const hasOut = ["completion", "output", "response", "answer", "expected"].some((k) => set.has(k));
  return hasIn && hasOut;
}

function columnsOf(rows: DatasetRow[]): string[] {
  const seen: string[] = [];
  for (const r of rows.slice(0, 200)) {
    for (const k of Object.keys(r ?? {})) if (!seen.includes(k)) seen.push(k);
  }
  // surface prompt/completion-ish fields first
  return seen.sort((a, b) => {
    const ai = PAIR_KEYS.indexOf(a.toLowerCase());
    const bi = PAIR_KEYS.indexOf(b.toLowerCase());
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

function flatten(v: unknown): DatasetRow {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as DatasetRow;
  return { value: v };
}

export function parseDataset(path: string, text: string): ParsedDataset | null {
  const kind = datasetKind(path);
  if (!kind) return null;
  const errors: string[] = [];

  if (kind === "csv" || kind === "tsv") {
    const res = Papa.parse<DatasetRow>(text.trim(), {
      header: true,
      skipEmptyLines: true,
      delimiter: kind === "tsv" ? "\t" : "",
      dynamicTyping: true,
    });
    for (const e of res.errors.slice(0, 5)) errors.push(`${e.type}: ${e.message} (row ${e.row ?? "?"})`);
    const rows = (res.data ?? []).filter((r) => r && typeof r === "object");
    const columns = (res.meta.fields ?? columnsOf(rows)).filter(Boolean) as string[];
    return { kind, columns, rows, pairs: isPairShape(columns), errors };
  }

  if (kind === "jsonl") {
    const rows: DatasetRow[] = [];
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      const t = line.trim();
      if (!t) return;
      try {
        rows.push(flatten(JSON.parse(t)));
      } catch {
        if (errors.length < 5) errors.push(`LINE_${i + 1}: INVALID_JSON`);
      }
    });
    if (!rows.length) return null;
    const columns = columnsOf(rows);
    return { kind, columns, rows, pairs: isPairShape(columns), errors };
  }

  // .json — only arrays of objects are tabular
  try {
    const data = JSON.parse(text);
    const arr = Array.isArray(data)
      ? data
      : Array.isArray((data as any)?.data)
        ? (data as any).data
        : Array.isArray((data as any)?.rows)
          ? (data as any).rows
          : Array.isArray((data as any)?.examples)
            ? (data as any).examples
            : null;
    if (!arr || !arr.length) return null;
    const rows = arr.map(flatten);
    const columns = columnsOf(rows);
    return { kind: "json", columns, rows, pairs: isPairShape(columns), errors };
  } catch {
    return null;
  }
}

export function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

export function toCsv(columns: string[], rows: DatasetRow[]): string {
  return Papa.unparse({ fields: columns, data: rows.map((r) => columns.map((c) => cellText(r[c]))) });
}
