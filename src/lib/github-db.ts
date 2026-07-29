const CACHE_PREFIX = "ghdb_cache:";
/** ETag entries expire after 24h so stale trees can never pin the UI forever. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
/** Hard ceiling on cached payload size (chars) — keeps localStorage healthy. */
const CACHE_MAX_ENTRY = 512 * 1024;

export type CacheStatus = "MISS" | "FRESH" | "304";

export function getPat(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem("github_pat") ?? "";
}

export function setPat(v: string) {
  if (typeof window === "undefined") return;
  if (v) window.localStorage.setItem("github_pat", v);
  else window.localStorage.removeItem("github_pat");
}

/** Accepts "owner/repo", a raw GitHub URL, or a bare owner string. */
export function parseRepoInput(raw: string): { owner: string; repo?: string } {
  let s = (raw || "").trim();
  if (!s) return { owner: "" };
  s = s.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  s = s.replace(/^git@github\.com:/i, "");
  s = s.replace(/\.git$/i, "");
  s = s.replace(/^\/+|\/+$/g, "");
  const parts = s.split("/").filter(Boolean);
  return { owner: parts[0] ?? "", repo: parts[1] };
}

export type RateLimit = { remaining: number | null; limit: number | null };

export type ApiResult<T> = {
  data: T;
  status: CacheStatus;
  rate: RateLimit;
};

type CacheEnvelope<T> = { etag: string; data: T; ts?: number };

/** Drops every ghdb cache entry (used on quota pressure and on TTL sweeps). */
function pruneCache(all = false) {
  if (typeof window === "undefined") return;
  const now = Date.now();
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const k = window.localStorage.key(i);
    if (!k || !k.startsWith(CACHE_PREFIX)) continue;
    if (all) {
      window.localStorage.removeItem(k);
      continue;
    }
    try {
      const env = JSON.parse(window.localStorage.getItem(k) ?? "null") as CacheEnvelope<unknown> | null;
      if (!env || !env.ts || now - env.ts > CACHE_TTL_MS) window.localStorage.removeItem(k);
    } catch {
      window.localStorage.removeItem(k);
    }
  }
}

function readCache<T>(key: string): { etag: string; data: T } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const env = JSON.parse(raw) as CacheEnvelope<T>;
    if (!env?.etag) return null;
    if (env.ts && Date.now() - env.ts > CACHE_TTL_MS) {
      window.localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    return { etag: env.etag, data: env.data };
  } catch {
    return null;
  }
}

function writeCache(key: string, etag: string, data: unknown) {
  if (typeof window === "undefined" || !etag) return;
  let payload: string;
  try {
    payload = JSON.stringify({ etag, data, ts: Date.now() });
  } catch {
    return;
  }
  if (payload.length > CACHE_MAX_ENTRY) return;
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, payload);
  } catch {
    // Quota exceeded: sweep expired entries, then retry once, then give up.
    pruneCache();
    try {
      window.localStorage.setItem(CACHE_PREFIX + key, payload);
    } catch {
      pruneCache(true);
    }
  }
}

/** Public escape hatch for the settings drawer. */
export function clearGithubCache() {
  pruneCache(true);
}

export async function ghFetch<T>(path: string): Promise<ApiResult<T>> {
  const url = `https://api.github.com${path}`;
  const cached = readCache<T>(url);
  const pat = getPat();
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (pat) headers.Authorization = `Bearer ${pat}`;
  if (cached?.etag) headers["If-None-Match"] = cached.etag;

  const res = await fetch(url, { headers, cache: "no-store" });
  const rate: RateLimit = {
    remaining: numOrNull(res.headers.get("x-ratelimit-remaining")),
    limit: numOrNull(res.headers.get("x-ratelimit-limit")),
  };

  if (res.status === 304 && cached) {
    return { data: cached.data, status: "304", rate };
  }
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const b = await res.json();
      if (b?.message) msg = `${res.status} ${b.message}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as T;
  const etag = res.headers.get("etag") ?? "";
  writeCache(url, etag, data);
  return { data, status: "FRESH", rate };
}

function numOrNull(v: string | null) {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function fetchRaw(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
): Promise<string> {
  const enc = filePath.split("/").map(encodeURIComponent).join("/");
  const pat = getPat();

  // 1) raw CDN — CORS-safe ONLY without custom headers (an Authorization
  //    header triggers a preflight that raw.githubusercontent.com rejects,
  //    surfacing as "Failed to fetch"). Works for public repos.
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${enc}`,
      { cache: "no-store" },
    );
    if (res.ok) return await res.text();
  } catch {
    /* fall through to the REST contents API */
  }

  // 2) REST contents API — supports CORS with auth, works for private repos.
  const headers: Record<string, string> = { Accept: "application/vnd.github.raw" };
  if (pat) headers.Authorization = `Bearer ${pat}`;
  const api = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${enc}?ref=${encodeURIComponent(branch)}`,
    { headers, cache: "no-store" },
  );
  if (api.ok) return await api.text();

  let detail = String(api.status);
  try {
    const b = await api.json();
    if (b?.message) detail = `${api.status} ${b.message}`;
  } catch {
    /* ignore */
  }
  throw new Error(
    `RAW_FETCH_FAILED (${detail})${pat ? "" : " — connect a GITHUB_PAT for private repos"}`,
  );
}

export type TreeItem = {
  path: string;
  mode: string;
  type: "blob" | "tree";
  sha: string;
  size?: number;
};

export function dirOf(path: string) {
  const i = path.lastIndexOf("/");
  return i === -1 ? "root" : path.slice(0, i);
}