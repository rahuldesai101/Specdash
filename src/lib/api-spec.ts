/** OpenAPI / Swagger discovery + endpoint extraction for the API Sandbox. */

export type Endpoint = {
  method: string;
  url: string;
  summary?: string;
  source: string;
};

const METHODS = ["get", "post", "put", "patch", "delete", "head", "options"];

export function isApiSpecPath(p: string) {
  const n = p.toLowerCase();
  return (
    /(^|\/)(openapi|swagger)(\.[\w-]+)?\.(json|ya?ml)$/.test(n) ||
    /(^|\/)(api-docs|apispec)\.(json|ya?ml)$/.test(n)
  );
}

/** Very small YAML-ish / JSON loader — only what an OpenAPI doc needs. */
function loadDoc(text: string): any | null {
  const t = text.trim();
  if (t.startsWith("{")) {
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  }
  return yamlLite(text);
}

/** Indentation-based mini-YAML parser (maps + scalars + simple lists). */
function yamlLite(src: string): any {
  const root: any = {};
  const stack: Array<{ indent: number; node: any }> = [{ indent: -1, node: root }];
  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.replace(/\t/g, "  ");
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const indent = line.length - line.trimStart().length;
    const body = line.trim();
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].node;
    if (body.startsWith("- ")) {
      const key = "__list";
      if (!Array.isArray(parent[key])) parent[key] = [];
      parent[key].push(body.slice(2).trim());
      continue;
    }
    const m = body.match(/^("?[^":]+"?)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].replace(/^"|"$/g, "");
    const val = m[2].trim();
    if (val === "" || val === "|" || val === ">") {
      const node: any = {};
      parent[key] = node;
      stack.push({ indent, node });
    } else {
      parent[key] = val.replace(/^["']|["']$/g, "");
    }
  }
  return root;
}

function baseUrlOf(doc: any): string {
  const s = doc?.servers;
  if (s && typeof s === "object") {
    const first = Array.isArray(s) ? s[0] : Object.values(s)[0];
    const u = typeof first === "string" ? first : (first as any)?.url;
    if (typeof u === "string" && /^https?:\/\//.test(u)) return u.replace(/\/$/, "");
    if (Array.isArray((s as any).__list)) {
      const line = (s as any).__list.find((l: string) => /url:/.test(l));
      const url = line?.split(/url:\s*/)[1]?.trim().replace(/^["']|["']$/g, "");
      if (url) return url.replace(/\/$/, "");
    }
  }
  if (typeof doc?.host === "string") {
    const scheme = Array.isArray(doc.schemes) ? doc.schemes[0] : "https";
    return `${scheme}://${doc.host}${doc.basePath ?? ""}`.replace(/\/$/, "");
  }
  return "";
}

export function endpointsFromSpec(text: string, source: string): Endpoint[] {
  const doc = loadDoc(text);
  if (!doc?.paths || typeof doc.paths !== "object") return [];
  const base = baseUrlOf(doc);
  const out: Endpoint[] = [];
  for (const [p, ops] of Object.entries<any>(doc.paths)) {
    if (!ops || typeof ops !== "object") continue;
    for (const [m, op] of Object.entries<any>(ops)) {
      if (!METHODS.includes(m.toLowerCase())) continue;
      out.push({
        method: m.toUpperCase(),
        url: `${base}${p}`,
        summary: typeof op?.summary === "string" ? op.summary : typeof op?.operationId === "string" ? op.operationId : undefined,
        source,
      });
    }
  }
  return out;
}

/** Scrape absolute http(s) URLs out of any open file (markdown, code, etc). */
export function endpointsFromText(text: string, source: string): Endpoint[] {
  const seen = new Set<string>();
  const out: Endpoint[] = [];
  const re = /https?:\/\/[^\s"'`)<>\]]+/g;
  for (const raw of text.match(re) ?? []) {
    const url = raw.replace(/[.,;:]+$/, "");
    if (!/\/(api|v\d)(\/|$)|api\./i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ method: "GET", url, source });
    if (out.length >= 40) break;
  }
  return out;
}

export type HttpResult = {
  status: number;
  statusText: string;
  ms: number;
  headers: Record<string, string>;
  body: string;
  contentType: string;
  size: number;
};

export function parseHeaderBlock(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim();
    if (k) out[k] = v;
  }
  return out;
}

export async function sendRequest(opts: {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
}): Promise<HttpResult> {
  if (!isHttpUrl(opts.url)) throw new Error("INVALID_URL — only http(s) endpoints are allowed");
  const started = performance.now();
  const init: RequestInit = { method: opts.method, headers: opts.headers, cache: "no-store" };
  if (!["GET", "HEAD"].includes(opts.method.toUpperCase()) && opts.body) init.body = opts.body;
  const res = await fetch(opts.url, init);
  const text = await res.text();
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  return {
    status: res.status,
    statusText: res.statusText,
    ms: Math.round(performance.now() - started),
    headers,
    body: text,
    contentType: res.headers.get("content-type") ?? "",
    size: new Blob([text]).size,
  };
}

export function prettyBody(body: string, contentType: string) {
  if (/json/i.test(contentType) || /^[[{]/.test(body.trim())) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}