import { useEffect, useMemo, useRef, useState } from "react";
import { fetchRaw } from "@/lib/github-db";
import { buildDocs, createIndex, type FileMeta, type SearchDoc } from "@/lib/search-index";

const MAX_FILES = 300;
const MAX_BYTES = 400_000;
const CONCURRENCY = 6;
const TEXTUAL = /\.(md|txt|ya?ml|json|jsonl|csv|tsv|cursorrules)$/i;

export type IndexState = {
  index: ReturnType<typeof createIndex> | null;
  docs: SearchDoc[];
  loaded: number;
  total: number;
  ready: boolean;
};

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

  const docs = useMemo(() => buildDocs(files, merged), [files, merged]);
  const index = useMemo(() => (docs.length ? createIndex(docs) : null), [docs]);

  return { index, docs, loaded, total: targets.length, ready };
}