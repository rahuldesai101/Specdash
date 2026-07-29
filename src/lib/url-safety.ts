/**
 * Central URL/scheme guards.
 *
 * Every href, image src and outbound fetch target in SPEC DASH comes from
 * untrusted repository content (markdown authored by a third party) or from
 * free-text user input. These helpers are the single choke point that keeps
 * `javascript:`, `data:`, `vbscript:` and `file:` payloads out of the DOM and
 * out of `fetch()`.
 */

const SAFE_LINK_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

function parse(url: string): URL | null {
  try {
    return new URL(url, typeof window === "undefined" ? "https://spec.dash" : window.location.origin);
  } catch {
    return null;
  }
}

/** Returns the href when it is safe to put in the DOM, otherwise "#". */
export function safeHref(href: string | undefined | null): string {
  const h = (href ?? "").trim();
  if (!h) return "#";
  if (h.startsWith("#") || h.startsWith("/") || h.startsWith("./") || h.startsWith("../")) return h;
  const u = parse(h);
  if (!u) return "#";
  return SAFE_LINK_SCHEMES.has(u.protocol) ? h : "#";
}

/** Image sources may only be http(s) — blocks data:/javascript: payloads. */
export function safeImageSrc(src: string | undefined | null): string {
  const s = (src ?? "").trim();
  if (!s) return "";
  if (s.startsWith("/") || s.startsWith("./") || s.startsWith("../")) return s;
  const u = parse(s);
  return u && (u.protocol === "http:" || u.protocol === "https:") ? s : "";
}

/** True when the URL is a plain http(s) endpoint (API sandbox / AI providers). */
export function isHttpUrl(url: string): boolean {
  const u = parse(url);
  return !!u && (u.protocol === "http:" || u.protocol === "https:");
}

/**
 * The CLI bridge is a *local* daemon. Restricting it to loopback stops a typo
 * (or a pasted hostile URL) from shipping workspace diffs and exec output to a
 * remote host.
 */
export function isLoopbackUrl(url: string): boolean {
  const u = parse(url);
  if (!u || (u.protocol !== "http:" && u.protocol !== "https:")) return false;
  return LOOPBACK_HOSTS.has(u.hostname) || u.hostname.endsWith(".localhost");
}
