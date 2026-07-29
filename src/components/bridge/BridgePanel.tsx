import { useState } from "react";
import { toast } from "sonner";
import { DevModal, Tab, Field, inputCls } from "@/components/devtools/Shell";
import type { CliBridge } from "@/hooks/use-cli-bridge";
import { BRIDGE_INSTALL, BRIDGE_SNIPPET, type ExecResult } from "@/lib/cli-bridge";

const STATUS_COLOR: Record<string, string> = {
  A: "#00ff66",
  M: "#ffaa00",
  D: "#ff5500",
  R: "#66b3ff",
  "??": "#888",
};

export function BridgePill({ bridge, onOpen }: { bridge: CliBridge; onOpen: () => void }) {
  const active = bridge.state === "ACTIVE";
  const tone = active ? "#00ff66" : bridge.state === "ERROR" ? "#ff5500" : bridge.state === "CONNECTING" ? "#ffaa00" : "#555";
  const dirty = bridge.status?.files.length ?? 0;
  return (
    <button
      onClick={onOpen}
      title="Local workspace CLI bridge (Alt+L)"
      className="inline-flex shrink-0 items-center gap-1 border px-1.5 py-0.5"
      style={{ borderColor: `${tone}44`, color: tone }}
    >
      🔌 LOCAL SYNC: {active ? "ACTIVE" : bridge.state === "CONNECTING" ? "…" : bridge.state === "ERROR" ? "ERR" : "OFF"}
      {active && dirty > 0 && <span style={{ color: "#ffaa00" }}>· {dirty} DIRTY</span>}
    </button>
  );
}

export function BridgePanel({
  bridge,
  commands,
  onClose,
}: {
  bridge: CliBridge;
  /** Executable commands parsed from AGENTS.md */
  commands: string[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"CONN" | "DIFF" | "EXEC">(bridge.state === "ACTIVE" ? "DIFF" : "CONN");
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<ExecResult[]>([]);

  const run = async (cmd: string) => {
    if (!cmd.trim() || busy) return;
    if (bridge.state !== "ACTIVE") {
      toast.error("BRIDGE_OFFLINE — connect first");
      return;
    }
    setBusy(cmd);
    try {
      const r = await bridge.exec(cmd);
      setLog((p) => [r, ...p].slice(0, 12));
      if (r.code === 0) toast.success(`EXIT_0 · ${cmd} (${r.ms}ms)`);
      else toast.error(`EXIT_${r.code} · ${cmd}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "EXEC_ERR");
    } finally {
      setBusy(null);
    }
  };

  const copy = (v: string, m: string) =>
    navigator.clipboard.writeText(v).then(() => toast.success(m)).catch(() => toast.error("CLIPBOARD_BLOCKED"));

  const files = bridge.status?.files ?? [];

  return (
    <DevModal
      title="LOCAL WORKSPACE CLI BRIDGE"
      accent="#ffaa00"
      onClose={onClose}
      toolbar={
        <>
          <Tab active={tab === "CONN"} onClick={() => setTab("CONN")}>
            [ 🔌 CONNECTION ]
          </Tab>
          <Tab active={tab === "DIFF"} onClick={() => setTab("DIFF")}>
            [ ⑂ UNCOMMITTED ({String(files.length).padStart(2, "0")}) ]
          </Tab>
          <Tab active={tab === "EXEC"} onClick={() => setTab("EXEC")}>
            [ ▶ RUN COMMANDS ({String(commands.length).padStart(2, "0")}) ]
          </Tab>
          <span
            className="ml-auto"
            style={{ color: bridge.state === "ACTIVE" ? "#00ff66" : bridge.state === "ERROR" ? "#ff5500" : "#666" }}
          >
            [ {bridge.state} {bridge.info?.branch ? `· ⑂ ${bridge.info.branch}` : ""} ]
          </span>
        </>
      }
      footer="LOOPBACK ONLY · NOTHING LEAVES YOUR MACHINE · THE BRIDGE IS ALWAYS OPTIONAL"
    >
      {tab === "CONN" && (
        <div className="space-y-3">
          <Field label="BRIDGE_ENDPOINT">
            <input value={bridge.url} onChange={(e) => bridge.setUrl(e.target.value)} className={inputCls} />
          </Field>
          <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest">
            <button
              onClick={() => void bridge.connect()}
              className="border border-[#00ff66] px-3 py-2 text-[#00ff66] hover:bg-[#00ff66] hover:text-black"
            >
              [ CONNECT ]
            </button>
            <button onClick={() => void bridge.refresh()} className="border border-[#333] px-3 py-2 text-[#888] hover:text-white">
              [ RE-PROBE ]
            </button>
            <button
              onClick={bridge.disconnect}
              className="border border-[#ff5500] px-3 py-2 text-[#ff5500] hover:bg-[#ff5500] hover:text-black"
            >
              [ DISCONNECT ]
            </button>
          </div>
          {bridge.error && <div className="break-all text-[11px] text-[#ff5500]">ERR: {bridge.error}</div>}
          {bridge.info && (
            <div className="border border-hard p-3 text-[10px] uppercase tracking-widest text-[#888]">
              <div>CWD: <span className="text-[#00ff66] normal-case">{bridge.info.cwd}</span></div>
              <div>BRANCH: {bridge.info.branch}</div>
              <div>DAEMON: v{bridge.info.version ?? "?"}</div>
            </div>
          )}
          <div className="border border-hard p-3 text-[10px] leading-relaxed text-[#666]">
            &gt; 1. Open a terminal inside your local clone.<br />
            &gt; 2. <code className="text-[#00ff66]">{BRIDGE_INSTALL}</code><br />
            &gt; 3. Hit [ CONNECT ] above — the dashboard then reads local git diff, runs whitelisted commands and can write generated specs to disk.
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-[#666]">[ REFERENCE DAEMON // bridge.mjs ]</span>
            <button
              onClick={() => copy(BRIDGE_SNIPPET, "BRIDGE_SCRIPT_COPIED")}
              className="border border-[#333] px-2 py-1 text-[10px] uppercase tracking-widest text-[#888] hover:border-[#00ff66] hover:text-[#00ff66]"
            >
              📋 COPY SCRIPT
            </button>
          </div>
          <pre className="max-h-64 overflow-auto border border-hard bg-[#050505] p-3 text-[10px] whitespace-pre text-[#888]">
            {BRIDGE_SNIPPET}
          </pre>
        </div>
      )}

      {tab === "DIFF" && (
        <div className="space-y-2">
          {bridge.state !== "ACTIVE" ? (
            <div className="py-8 text-center text-[11px] uppercase tracking-widest text-[#555]">
              &gt; BRIDGE_OFFLINE — connect to read local git state
            </div>
          ) : files.length === 0 ? (
            <div className="py-8 text-center text-[11px] uppercase tracking-widest text-[#00ff66]">
              &gt; WORKING_TREE_CLEAN
            </div>
          ) : (
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-[9px] uppercase tracking-widest text-[#666]">
                  <th className="border border-hard px-2 py-1 text-left font-normal">ST</th>
                  <th className="border border-hard px-2 py-1 text-left font-normal">LOCAL_PATH</th>
                  <th className="border border-hard px-2 py-1 text-left font-normal">+/−</th>
                </tr>
              </thead>
              <tbody>
                {files.map((f) => (
                  <tr key={f.path}>
                    <td className="border border-hard px-2 py-1" style={{ color: STATUS_COLOR[f.status] ?? "#888" }}>
                      {f.status}
                    </td>
                    <td className="border border-hard px-2 py-1 break-all text-white">{f.path}</td>
                    <td className="border border-hard px-2 py-1 tabular-nums">
                      <span className="text-[#00ff66]">+{f.additions ?? 0}</span>{" "}
                      <span className="text-[#ff5500]">−{f.deletions ?? 0}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "EXEC" && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void run(custom)}
              placeholder="npm test"
              className={inputCls}
            />
            <button
              onClick={() => void run(custom)}
              disabled={!custom.trim() || !!busy}
              className="shrink-0 border border-[#00ff66] px-3 text-[10px] uppercase tracking-widest text-[#00ff66] hover:bg-[#00ff66] hover:text-black disabled:opacity-30"
            >
              ▶ RUN
            </button>
          </div>
          <div className="text-[9px] uppercase tracking-widest text-[#666]">[ PARSED FROM AGENTS.md ]</div>
          {commands.length === 0 ? (
            <div className="text-[11px] text-[#555]">&gt; NO_EXECUTABLE_COMMANDS_FOUND</div>
          ) : (
            <ul className="space-y-2">
              {commands.map((c) => (
                <li key={c} className="flex items-stretch gap-2">
                  <code className="min-w-0 flex-1 truncate border border-hard px-2 py-2 text-[11px] text-[#00ff66]">$ {c}</code>
                  <button
                    onClick={() => void run(c)}
                    disabled={!!busy || bridge.state !== "ACTIVE"}
                    className="shrink-0 border border-[#ffaa00] px-2 text-[10px] uppercase tracking-widest text-[#ffaa00] hover:bg-[#ffaa00] hover:text-black disabled:opacity-30"
                  >
                    {busy === c ? "…RUNNING" : "▶ RUN"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {log.length > 0 && <div className="text-[9px] uppercase tracking-widest text-[#666]">[ OUTPUT ]</div>}
          {log.map((r, i) => (
            <div key={i} className="border border-hard">
              <div
                className="flex items-center justify-between border-b border-hard px-2 py-1 text-[10px] uppercase tracking-widest"
                style={{ color: r.code === 0 ? "#00ff66" : "#ff5500" }}
              >
                <span className="truncate">$ {r.cmd}</span>
                <span className="shrink-0">EXIT {r.code} · {r.ms}ms</span>
              </div>
              <pre className="max-h-56 overflow-auto bg-[#050505] p-2 text-[10px] whitespace-pre-wrap text-[#ccc]">
                {(r.stdout || "") + (r.stderr ? `\n${r.stderr}` : "") || "(no output)"}
              </pre>
            </div>
          ))}
        </div>
      )}
    </DevModal>
  );
}