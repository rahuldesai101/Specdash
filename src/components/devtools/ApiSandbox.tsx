import { useEffect, useMemo, useState } from "react";
import { fetchRaw, ghFetch, getPat, type TreeItem } from "@/lib/github-db";
import {
  endpointsFromSpec,
  endpointsFromText,
  isApiSpecPath,
  parseHeaderBlock,
  prettyBody,
  sendRequest,
  type Endpoint,
  type HttpResult,
} from "@/lib/api-spec";
import { DevModal, Field, inputCls, Tab } from "./Shell";
import { toast } from "sonner";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export function ApiSandbox({
  owner,
  repo,
  branch,
  activeFile,
  onClose,
}: {
  owner: string;
  repo: string;
  branch: string;
  activeFile?: { path: string; text: string | null } | null;
  onClose: () => void;
}) {
  const [method, setMethod] = useState<string>("GET");
  const [url, setUrl] = useState("https://api.github.com/repos/facebook/react");
  const [headerText, setHeaderText] = useState("Accept: application/json");
  const [body, setBody] = useState("{\n  \n}");
  const [res, setRes] = useState<HttpResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"body" | "headers">("body");
  const [discovered, setDiscovered] = useState<Endpoint[]>([]);
  const [scanning, setScanning] = useState(false);
  const [q, setQ] = useState("");

  // Discover endpoints from openapi/swagger docs + the currently open file.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const found: Endpoint[] = [];
      if (activeFile?.text) found.push(...endpointsFromText(activeFile.text, activeFile.path));
      if (!owner || !repo) {
        if (!cancelled) setDiscovered(found);
        return;
      }
      setScanning(true);
      try {
        const tree = await ghFetch<{ tree: TreeItem[] }>(
          `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        );
        const specs = tree.data.tree
          .filter((i) => i.type === "blob" && isApiSpecPath(i.path))
          .slice(0, 4);
        for (const s of specs) {
          try {
            const text = await fetchRaw(owner, repo, branch, s.path);
            found.push(...endpointsFromSpec(text, s.path));
          } catch {
            /* unreadable spec */
          }
        }
      } catch {
        /* tree unavailable */
      }
      if (!cancelled) {
        setDiscovered(found);
        setScanning(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [owner, repo, branch, activeFile?.path, activeFile?.text]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const seen = new Set<string>();
    return discovered
      .filter((e) => {
        const k = `${e.method} ${e.url}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return !needle || k.toLowerCase().includes(needle) || (e.summary ?? "").toLowerCase().includes(needle);
      })
      .slice(0, 200);
  }, [discovered, q]);

  const send = async () => {
    if (!/^https?:\/\//i.test(url.trim())) {
      setErr("URL must be absolute (http:// or https://)");
      return;
    }
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      const headers = parseHeaderBlock(headerText);
      if (!["GET", "HEAD"].includes(method) && body.trim() && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
      const r = await sendRequest({ method, url: url.trim(), headers, body });
      setRes(r);
    } catch (e) {
      setErr(
        `${e instanceof Error ? e.message : "REQUEST_FAILED"} — browser CORS may block this origin; try an API that sends Access-Control-Allow-Origin.`,
      );
    } finally {
      setBusy(false);
    }
  };

  const statusTone = !res ? "#666" : res.status < 300 ? "#00ff66" : res.status < 400 ? "#ffaa00" : "#ff5500";
  const pretty = res ? prettyBody(res.body, res.contentType) : "";

  return (
    <DevModal
      title="API_SANDBOX // HTTP_WORKBENCH"
      onClose={onClose}
      wide
      toolbar={
        <>
          <span className="text-[#666]">DISCOVERED</span>
          <span className="text-[#00ff66]">{discovered.length}</span>
          {scanning && <span className="text-[#ffaa00]">SCANNING_OPENAPI…</span>}
          <button
            onClick={() => setHeaderText((t) => (t.includes("Authorization") ? t : `${t}\nAuthorization: Bearer ${getPat() || "<TOKEN>"}`))}
            className="ml-auto border border-[#333] px-2 py-1 text-[#888] hover:border-[#00ff66] hover:text-[#00ff66]"
          >
            + INJECT PAT AUTH HEADER
          </button>
        </>
      }
      footer="Requests execute in your browser · CORS rules apply · no proxy, no data leaves your machine"
    >
      <div className="grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
        {/* endpoint explorer */}
        <div className="flex min-h-0 flex-col border border-[#1a1a1a]">
          <div className="border-b border-[#1a1a1a] p-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="filter endpoints…"
              className={inputCls}
            />
          </div>
          <div className="max-h-[46vh] overflow-y-auto">
            {list.length === 0 && (
              <div className="p-4 text-center text-[10px] uppercase tracking-widest text-[#555]">
                &gt; NO_ENDPOINTS_DETECTED
              </div>
            )}
            {list.map((e) => (
              <button
                key={`${e.method}${e.url}${e.source}`}
                onClick={() => {
                  setMethod(e.method);
                  setUrl(e.url);
                }}
                className="block w-full border-b border-[#141414] px-2 py-2 text-left hover:bg-[#0d0d0d]"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="shrink-0 text-[9px] tracking-widest"
                    style={{ color: e.method === "GET" ? "#00ff66" : e.method === "DELETE" ? "#ff5500" : "#ffaa00" }}
                  >
                    {e.method}
                  </span>
                  <span className="truncate text-[10px] text-[#ccc]">{e.url}</span>
                </div>
                <div className="truncate text-[9px] text-[#555]">{e.summary ?? `/${e.source}`}</div>
              </button>
            ))}
          </div>
        </div>

        {/* request / response */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-stretch gap-2">
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="border border-[#333] bg-black px-2 text-[11px] uppercase tracking-widest text-[#00ff66] outline-none"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="https://api.example.com/v1/resource"
              className={`${inputCls} min-w-[180px] flex-1`}
            />
            <button
              onClick={send}
              disabled={busy}
              className="border border-[#00ff66] px-4 text-[10px] uppercase tracking-widest text-[#00ff66] hover:bg-[#00ff66] hover:text-black disabled:opacity-40"
            >
              {busy ? "SENDING…" : "SEND ▸"}
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field label="HEADERS (key: value per line)">
              <textarea
                value={headerText}
                onChange={(e) => setHeaderText(e.target.value)}
                rows={5}
                className={`${inputCls} resize-y`}
              />
            </Field>
            <Field label="JSON PAYLOAD">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                disabled={["GET", "HEAD"].includes(method)}
                className={`${inputCls} resize-y disabled:opacity-35`}
              />
            </Field>
          </div>

          <div className="mt-3 border border-[#1a1a1a]">
            <div className="flex flex-wrap items-center gap-2 border-b border-[#1a1a1a] px-2 py-1.5 text-[9px] uppercase tracking-widest">
              <span style={{ color: statusTone }}>
                {res ? `${res.status} ${res.statusText || ""}` : err ? "ERROR" : "AWAITING_REQUEST"}
              </span>
              {res && (
                <>
                  <span className="text-[#666]">{res.ms} MS</span>
                  <span className="text-[#666]">{res.size} B</span>
                  <span className="truncate text-[#444]">{res.contentType || "—"}</span>
                </>
              )}
              <span className="ml-auto flex gap-1.5">
                <Tab active={tab === "body"} onClick={() => setTab("body")}>
                  BODY
                </Tab>
                <Tab active={tab === "headers"} onClick={() => setTab("headers")}>
                  HEADERS
                </Tab>
                {res && (
                  <button
                    onClick={() => {
                      navigator.clipboard
                        .writeText(tab === "body" ? pretty : JSON.stringify(res.headers, null, 2))
                        .then(() => toast.success("RESPONSE_COPIED"))
                        .catch(() => toast.error("CLIPBOARD_BLOCKED"));
                    }}
                    className="border border-[#333] px-2 py-1 text-[#888] hover:text-[#00ff66]"
                  >
                    COPY
                  </button>
                )}
              </span>
            </div>
            <pre className="max-h-[38vh] overflow-auto p-2 text-[11px] leading-relaxed">
              {err ? (
                <span className="text-[#ff5500]">{err}</span>
              ) : !res ? (
                <span className="text-[#555]">&gt; send a request to inspect the response…</span>
              ) : tab === "headers" ? (
                <span className="text-[#9fd]">{JSON.stringify(res.headers, null, 2)}</span>
              ) : (
                <JsonView text={pretty} />
              )}
            </pre>
          </div>
        </div>
      </div>
    </DevModal>
  );
}

/** Tiny token colorizer for JSON-ish payloads. */
function JsonView({ text }: { text: string }) {
  const parts = useMemo(() => {
    const out: Array<{ t: string; c: string }> = [];
    const re = /("(?:\\.|[^"\\])*"\s*:)|("(?:\\.|[^"\\])*")|(\b-?\d+(?:\.\d+)?\b)|(\btrue\b|\bfalse\b|\bnull\b)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ t: text.slice(last, m.index), c: "#777" });
      out.push({
        t: m[0],
        c: m[1] ? "#00ff66" : m[2] ? "#ffcc66" : m[3] ? "#c07cff" : "#66b3ff",
      });
      last = m.index + m[0].length;
      if (out.length > 4000) break;
    }
    if (last < text.length) out.push({ t: text.slice(last, last + 40000), c: "#777" });
    return out;
  }, [text]);
  return (
    <>
      {parts.map((p, i) => (
        <span key={i} style={{ color: p.c }}>
          {p.t}
        </span>
      ))}
    </>
  );
}