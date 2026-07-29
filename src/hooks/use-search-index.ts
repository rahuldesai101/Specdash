import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchRaw } from "@/lib/github-db";
import type { FileMeta } from "@/lib/search-index";
import type { SearchCounts, SearchHit, WorkerRes } from "@/lib/search-worker-types";

const MAX_FILES = 300;
const MAX_BYTES = 400_000;
const CONCURRENCY = 6;
const TEXTUAL = /\.(md|txt|ya?ml|json|jsonl|csv|tsv|cursorrules)$/i;

export type IndexState = {
  /** Runs entirely inside the search worker — never blocks the UI thread. */
  search: (q: string, filter: string, limit?: number) => Promise<SearchHit[]>;
  counts: SearchCounts;
  docCount: number;
  /** Raw file bodies already streamed to the client (used for context packing). */
  contents: Record<string, string>;
  loaded: number;
  total: number;
  ready: boolean;
};

const EMPTY_COUNTS: SearchCounts = { all: 0, spec: 0, agent: 0, snippet: 0, data: 0, prompts: 0 };

/**
 * Streams raw file bodies from the GitHub CDN in the background and rebuilds
 * an in-memory MiniSearch index as content lands.
 */
export function useSearchIndex(
  owner: string,
  repo: string,
  branch: string,
  files: (FileMeta & { size: number })[],
  seed: Record<string, string>,
): IndexState {
  const [contents, setContents] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(0);
  const [ready, setReady] = useState(false);
  const keyRef = useRef("");
  const [counts, setCounts] = useState<SearchCounts>(EMPTY_COUNTS);
  const [docCount, setDocCount] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, (hits: SearchHit[]) => void>());
  const seqRef = useRef(0);

  // --- worker lifecycle -------------------------------------------------------
  useEffect(() => {
    const w = new Worker(new URL("../lib/search.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    w.onmessage = (e: MessageEvent<WorkerRes>) => {
      const m = e.data;
      if (m.type === "built") {
        setDocCount(m.docCount);
        setCounts(m.counts);
      } else {
        pending.current.get(m.id)?.(m.hits);
        pending.current.delete(m.id);
      }
    };
    return () => {
      w.terminate();
      workerRef.current = null;
      pending.current.clear();
    };
  }, []);

  const targets = useMemo(
    () => files.filter((f) => TEXTUAL.test(f.path) && f.size <= MAX_BYTES).slice(0, MAX_FILES),
    [files],
  );

  useEffect(() => {
    const key = `${owner}/${repo}@${branch}:${targets.length}`;
    if (!owner || !repo || !targets.length || keyRef.current === key) return;
    keyRef.current = key;
    setContents({});
    setLoaded(0);
    setReady(false);

    let cancelled = false;
    const queue = targets.slice();

    const worker = async () => {
      while (!cancelled) {
        const next = queue.shift();
        if (!next) return;
        try {
          const text = await fetchRaw(owner, repo, branch, next.path);
          if (cancelled) return;
          setContents((p) => ({ ...p, [next.path]: text }));
        } catch {
          /* skip unreadable file */
        }
        if (!cancelled) setLoaded((n) => n + 1);
      }
    };

    Promise.all(Array.from({ length: CONCURRENCY }, worker)).then(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [owner, repo, branch, targets]);

  const merged = useMemo(() => ({ ...seed, ...contents }), [seed, contents]);

  // Re-index off-thread, coalesced: streaming file bodies would otherwise
  // rebuild the index dozens of times per second.
  useEffect(() => {
    const w = workerRef.current;
    if (!w || !files.length) return;
    const t = setTimeout(() => {
      w.postMessage({
        type: "build",
        id: ++seqRef.current,
        files: files.map((f) => ({ path: f.path, name: f.name, dir: f.dir })),
        contents: merged,
      });
    }, 250);
    return () => clearTimeout(t);
  }, [files, merged]);

  const search = useCallback((q: string, filter: string, limit = 60) => {
    const w = workerRef.current;
    if (!w) return Promise.resolve<SearchHit[]>([]);
    const id = ++seqRef.current;
    return new Promise<SearchHit[]>((resolve) => {
      pending.current.set(id, resolve);
      w.postMessage({ type: "search", id, q, filter, limit });
    });
  }, []);

  return { search, counts, docCount, contents: merged, loaded, total: targets.length, ready };
}