/// <reference lib="webworker" />
/**
 * Off-main-thread search engine.
 *
 * The worker owns the MiniSearch index end-to-end: document building,
 * indexing, querying AND snippet highlighting. The UI thread only ever ships
 * a query string and receives a small, render-ready hit array, so typing in
 * Ctrl+K never competes with indexing for frame budget.
 */
import MiniSearch from "minisearch";
import { buildDocs, createIndex, snippetFor, type FileMeta, type SearchDoc } from "./search-index";
import type { SearchHit, WorkerReq, WorkerRes } from "./search-worker-types";

let docs: SearchDoc[] = [];
let index: MiniSearch<SearchDoc> | null = null;

const tokensOf = (s: string) => Math.ceil((s?.length ?? 0) / 4);

function toHit(d: SearchDoc, score: number, terms: string[]): SearchHit {
  return {
    id: d.id,
    path: d.path,
    dir: d.dir,
    name: d.name,
    kind: d.kind,
    lang: d.lang,
    headings: d.headings,
    content: d.kind === "snippet" ? d.content : "",
    tokens: tokensOf(d.content),
    score,
    segs: snippetFor(d.content, terms),
  };
}

self.onmessage = (e: MessageEvent<WorkerReq>) => {
  const msg = e.data;
  const post = (r: WorkerRes) => (self as unknown as Worker).postMessage(r);

  if (msg.type === "build") {
    docs = buildDocs(msg.files as FileMeta[], msg.contents);
    index = createIndex(docs);
    const counts: Record<string, number> = { all: 0, spec: 0, agent: 0, snippet: 0, data: 0, prompts: 0 };
    for (const d of docs) {
      counts.all += 1;
      counts[d.kind] = (counts[d.kind] ?? 0) + 1;
    }
    post({ type: "built", id: msg.id, docCount: docs.length, counts });
    return;
  }

  if (msg.type === "search") {
    const q = msg.q.trim();
    const terms = q.split(/\s+/).filter(Boolean);
    let pool: SearchHit[] = [];
    if (!index) pool = [];
    else if (q) {
      pool = index
        .search(q)
        .slice(0, 200)
        .map((r) => {
          const d = docs.find((x) => x.id === (r.id as string));
          return d ? toHit(d, r.score, terms) : null;
        })
        .filter(Boolean) as SearchHit[];
    } else {
      pool = docs
        .filter((d) => d.kind !== "snippet")
        .slice(0, 60)
        .map((d) => toHit(d, 0, terms));
    }
    const hits = (msg.filter === "all" ? pool : pool.filter((h) => h.kind === msg.filter)).slice(0, msg.limit);
    post({ type: "results", id: msg.id, hits });
  }
};