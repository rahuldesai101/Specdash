/** GitHub + app permalink builders. All paths are normalized and URL-safe. */

export const DEFAULT_BRANCH = "main";

/** Strip leading/trailing slashes and collapse duplicate separators. */
export function normalizePath(path: string): string {
  return String(path ?? "")
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

/** Encode each path segment while keeping "/" separators intact. */
export function encodePath(path: string): string {
  return normalizePath(path)
    .split("/")
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
}

const safeRef = (ref?: string | null) => {
  const r = normalizePath(ref ?? "");
  return r ? r.split("/").map(encodeURIComponent).join("/") : DEFAULT_BRANCH;
};

const repoRoot = (owner: string, repo: string) =>
  `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

/** https://github.com/{owner}/{repo}/blob/{ref}/{filePath} */
export function ghBlobUrl(
  owner: string,
  repo: string,
  ref: string | null | undefined,
  filePath: string,
): string {
  const p = encodePath(filePath);
  const base = `${repoRoot(owner, repo)}/blob/${safeRef(ref)}`;
  return p ? `${base}/${p}` : `${repoRoot(owner, repo)}/tree/${safeRef(ref)}`;
}

/** https://github.com/{owner}/{repo}/tree/{ref}/{folderPath} */
export function ghTreeUrl(
  owner: string,
  repo: string,
  ref: string | null | undefined,
  folderPath?: string | null,
): string {
  const dir = normalizePath(folderPath ?? "");
  const base = `${repoRoot(owner, repo)}/tree/${safeRef(ref)}`;
  if (!dir || dir === "root" || dir === ".") return base;
  return `${base}/${encodePath(dir)}`;
}

/** Internal share link: /?repo={owner}/{repo}&path={filePath}[&branch=] */
export function appPermalink(
  owner: string,
  repo: string,
  filePath?: string | null,
  branch?: string | null,
  origin?: string,
): string {
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "https://specdash.lovable.app");
  const qs = new URLSearchParams();
  qs.set("repo", `${owner}/${repo}`);
  const p = normalizePath(filePath ?? "");
  if (p) qs.set("path", p);
  if (branch && branch !== DEFAULT_BRANCH) qs.set("branch", branch);
  return `${base}/?${qs.toString()}`;
}

/** Parse ?repo=owner/repo&path=...&branch=... from a query string. */
export function parseDeepLink(search: string) {
  const q = new URLSearchParams(search);
  const repoParam = q.get("repo") ?? "";
  const [owner, repo] = repoParam.split("/").map((s) => s?.trim());
  return {
    owner: owner || null,
    repo: repo || null,
    path: normalizePath(q.get("path") ?? "") || null,
    branch: q.get("branch")?.trim() || null,
  };
}
