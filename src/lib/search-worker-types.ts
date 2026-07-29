/** Shared message contract between the UI thread and the search worker. */
import type { DocKind, Segment } from "./search-index";

export type SearchHit = {
  id: string;
  path: string;
  dir: string;
  name: string;
  kind: DocKind;
  lang?: string;
  headings: string;
  /** Only populated for runnable snippet hits (keeps postMessage payloads small). */
  content: string;
  tokens: number;
  score: number;
  segs: Segment[];
};

export type SearchCounts = Record<string, number>;

export type WorkerReq =
  | { type: "build"; id: number; files: { path: string; name: string; dir: string }[]; contents: Record<string, string> }
  | { type: "search"; id: number; q: string; filter: string; limit: number };

export type WorkerRes =
  | { type: "built"; id: number; docCount: number; counts: SearchCounts }
  | { type: "results"; id: number; hits: SearchHit[] };