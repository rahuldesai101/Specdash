/**
 * Local Workspace CLI Bridge.
 *
 * SPEC DASH stays a pure browser app: the GitHub repo is the database. The
 * bridge is a *strictly optional* localhost daemon that lets the dashboard
 * additionally see uncommitted work, run whitelisted commands and write
 * generated `.specify/` files to real disk.
 *
 * Contract (REST, JSON, CORS-open, loopback only):
 *   GET  /health      -> { ok, cwd, branch, version }
 *   GET  /git/status  -> { branch, ahead, behind, files: [{ path, status, additions, deletions }] }
 *   POST /exec        -> { cmd } => { code, stdout, stderr, ms }
 *   POST /write       -> { files: [{ path, content }] } => { written: string[] }
 */

import { isLoopbackUrl } from "./url-safety";

export const DEFAULT_BRIDGE_URL = "http://localhost:4321";

const URL_KEY = "cli_bridge_url";
const ON_KEY = "cli_bridge_enabled";

export type BridgeInfo = { ok: boolean; cwd: string; branch: string; version?: string };
export type BridgeFile = {
  path: string;
  status: string;
  additions?: number;
  deletions?: number;
};
export type BridgeStatus = {
  branch: string;
  ahead?: number;
  behind?: number;
  files: BridgeFile[];
};
export type ExecResult = { cmd: string; code: number; stdout: string; stderr: string; ms: number };

export type BridgeState = "OFF" | "CONNECTING" | "ACTIVE" | "ERROR";

export function getBridgeUrl(): string {
  if (typeof window === "undefined") return DEFAULT_BRIDGE_URL;
  const stored = window.localStorage.getItem(URL_KEY) || DEFAULT_BRIDGE_URL;
  // Defence in depth: a non-loopback value (tampered storage, stale entry)
  // must never become an exfiltration target for diffs / exec output.
  return isLoopbackUrl(stored) ? stored : DEFAULT_BRIDGE_URL;
}

export function setBridgeUrl(v: string) {
  if (typeof window === "undefined") return;
  const next = v.trim().replace(/\/$/, "") || DEFAULT_BRIDGE_URL;
  if (!isLoopbackUrl(next)) throw new Error("BRIDGE_URL_REJECTED — loopback addresses only (http://localhost:PORT)");
  window.localStorage.setItem(URL_KEY, next);
}

export function isBridgeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ON_KEY) === "1";
}

export function setBridgeEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  if (on) window.localStorage.setItem(ON_KEY, "1");
  else window.localStorage.removeItem(ON_KEY);
}

async function call<T>(url: string, path: string, init?: RequestInit, timeoutMs = 8000): Promise<T> {
  if (!isLoopbackUrl(url)) throw new Error("BRIDGE_URL_REJECTED — loopback addresses only");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`BRIDGE_${res.status}: ${text.slice(0, 200) || res.statusText}`);
    return (text ? JSON.parse(text) : {}) as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error("BRIDGE_TIMEOUT");
    if (e instanceof TypeError) throw new Error("BRIDGE_UNREACHABLE — is the daemon running?");
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export const pingBridge = (url: string) => call<BridgeInfo>(url, "/health", undefined, 3500);

export const bridgeStatus = (url: string) => call<BridgeStatus>(url, "/git/status");

export const bridgeExec = (url: string, cmd: string) =>
  call<ExecResult>(url, "/exec", { method: "POST", body: JSON.stringify({ cmd }) }, 120_000);

export const bridgeWrite = (url: string, files: { path: string; content: string }[]) =>
  call<{ written: string[] }>(url, "/write", { method: "POST", body: JSON.stringify({ files }) }, 20_000);

/** Diff-stat totals for the header pill. */
export function diffTotals(s: BridgeStatus | null) {
  if (!s) return { files: 0, add: 0, del: 0 };
  return {
    files: s.files.length,
    add: s.files.reduce((n, f) => n + (f.additions ?? 0), 0),
    del: s.files.reduce((n, f) => n + (f.deletions ?? 0), 0),
  };
}

/** One-liner install shown in the connection tab. */
export const BRIDGE_INSTALL = "npx spec-dash-bridge   # or run the script below with: node bridge.mjs";

/** Zero-dependency reference daemon the user can paste into `bridge.mjs`. */
export const BRIDGE_SNIPPET = `// bridge.mjs — run inside your repo:  node bridge.mjs
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const ROOT = process.cwd();
const PORT = 4321;
// Only these binaries may run. Edit to taste.
const ALLOW = ["npm", "pnpm", "yarn", "bun", "node", "pytest", "python", "cargo", "go", "make", "git"];

const sh = (cmd) =>
  new Promise((res) => {
    const started = Date.now();
    execFile(process.platform === "win32" ? "cmd" : "sh",
      process.platform === "win32" ? ["/c", cmd] : ["-c", cmd],
      { cwd: ROOT, maxBuffer: 8e6, timeout: 120000 },
      (err, stdout, stderr) =>
        res({ cmd, code: err?.code ?? 0, stdout: String(stdout), stderr: String(stderr), ms: Date.now() - started }));
  });

const json = (res, code, body) => {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  if (req.method === "OPTIONS") return json(res, 204, {});
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname === "/health") {
      const b = await sh("git rev-parse --abbrev-ref HEAD");
      return json(res, 200, { ok: true, cwd: ROOT, branch: b.stdout.trim(), version: "1.0.0" });
    }
    if (url.pathname === "/git/status") {
      const b = await sh("git rev-parse --abbrev-ref HEAD");
      const s = await sh("git status --porcelain=v1");
      const n = await sh("git diff --numstat HEAD");
      const stat = new Map(n.stdout.trim().split("\\n").filter(Boolean).map((l) => {
        const [a, d, p] = l.split("\\t");
        return [p, { additions: Number(a) || 0, deletions: Number(d) || 0 }];
      }));
      const files = s.stdout.trim().split("\\n").filter(Boolean).map((l) => {
        const status = l.slice(0, 2).trim() || "M";
        const path = l.slice(3).trim();
        return { path, status, ...(stat.get(path) ?? { additions: 0, deletions: 0 }) };
      });
      return json(res, 200, { branch: b.stdout.trim(), files });
    }
    let body = "";
    for await (const c of req) body += c;
    const payload = body ? JSON.parse(body) : {};
    if (url.pathname === "/exec") {
      const bin = String(payload.cmd || "").trim().split(/\\s+/)[0];
      if (!ALLOW.includes(bin)) return json(res, 403, { error: "COMMAND_NOT_ALLOWED: " + bin });
      return json(res, 200, await sh(payload.cmd));
    }
    if (url.pathname === "/write") {
      const written = [];
      for (const f of payload.files ?? []) {
        const abs = resolve(join(ROOT, f.path));
        if (!abs.startsWith(ROOT)) return json(res, 403, { error: "PATH_ESCAPE" });
        await mkdir(dirname(abs), { recursive: true });
        await writeFile(abs, f.content, "utf8");
        written.push(f.path);
      }
      return json(res, 200, { written });
    }
    json(res, 404, { error: "NOT_FOUND" });
  } catch (e) {
    json(res, 500, { error: String(e?.message ?? e) });
  }
}).listen(PORT, "127.0.0.1", () => console.log("[spec-dash-bridge] http://localhost:" + PORT + " @ " + ROOT));
`;