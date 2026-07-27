export function resolveRelativePath(currentFilePath: string, relativeTarget: string): string {
  const target = relativeTarget.replace(/^\.\//, "");
  if (relativeTarget.startsWith("/")) return normalize(relativeTarget.slice(1).split("/"));
  const base = currentFilePath.split("/").slice(0, -1);
  return normalize([...base, ...target.split("/")]);
}

function normalize(parts: string[]): string {
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

export function isExternal(href: string) {
  return /^(https?:)?\/\//i.test(href) || /^(mailto|tel):/i.test(href);
}

export function rawUrl(owner: string, repo: string, branch: string, path: string) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export function blobUrl(owner: string, repo: string, branch: string, path: string) {
  return `https://github.com/${owner}/${repo}/blob/${branch}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export function slugify(text: string) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}
