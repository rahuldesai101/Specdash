import { useCallback, useEffect, useRef, useState } from "react";
import {
  bridgeExec,
  bridgeStatus,
  bridgeWrite,
  getBridgeUrl,
  isBridgeEnabled,
  pingBridge,
  setBridgeEnabled,
  setBridgeUrl,
  type BridgeInfo,
  type BridgeState,
  type BridgeStatus,
  type ExecResult,
} from "@/lib/cli-bridge";

export type CliBridge = {
  url: string;
  enabled: boolean;
  state: BridgeState;
  info: BridgeInfo | null;
  status: BridgeStatus | null;
  error: string | null;
  setUrl: (v: string) => void;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  refresh: () => Promise<void>;
  exec: (cmd: string) => Promise<ExecResult>;
  write: (files: { path: string; content: string }[]) => Promise<string[]>;
};

/** Optional localhost sync engine. Never required — degrades to OFF. */
export function useCliBridge(): CliBridge {
  const [url, setUrlState] = useState(DEFAULT());
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<BridgeState>("OFF");
  const [info, setInfo] = useState<BridgeInfo | null>(null);
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const probe = useCallback(async (target: string) => {
    setState("CONNECTING");
    try {
      const i = await pingBridge(target);
      setInfo(i);
      setError(null);
      setState("ACTIVE");
      try {
        setStatus(await bridgeStatus(target));
      } catch {
        /* status is best-effort */
      }
      return true;
    } catch (e) {
      setInfo(null);
      setStatus(null);
      setError(e instanceof Error ? e.message : "BRIDGE_ERR");
      setState("ERROR");
      return false;
    }
  }, []);

  useEffect(() => {
    const u = getBridgeUrl();
    setUrlState(u);
    if (isBridgeEnabled()) {
      setEnabled(true);
      void probe(u);
    }
  }, [probe]);

  // Poll local git state while connected.
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!enabled || state !== "ACTIVE") return;
    timer.current = setInterval(() => {
      bridgeStatus(url)
        .then(setStatus)
        .catch(() => setState("ERROR"));
    }, 6000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [enabled, state, url]);

  const connect = useCallback(async () => {
    try {
      setBridgeUrl(url);
    } catch (e) {
      setState("ERROR");
      setError(e instanceof Error ? e.message : "BRIDGE_URL_REJECTED");
      return;
    }
    setBridgeEnabled(true);
    setEnabled(true);
    return probe(url);
  }, [url, probe]);

  const disconnect = useCallback(() => {
    setBridgeEnabled(false);
    setEnabled(false);
    setState("OFF");
    setInfo(null);
    setStatus(null);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    await probe(url);
  }, [enabled, url, probe]);

  const exec = useCallback((cmd: string) => bridgeExec(url, cmd), [url]);

  const write = useCallback(
    async (files: { path: string; content: string }[]) => (await bridgeWrite(url, files)).written,
    [url],
  );

  const setUrl = useCallback((v: string) => {
    setUrlState(v);
    // Persist only valid loopback targets; keep typing responsive otherwise.
    try {
      setBridgeUrl(v);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "BRIDGE_URL_REJECTED");
    }
  }, []);

  return { url, enabled, state, info, status, error, setUrl, connect, disconnect, refresh, exec, write };
}

function DEFAULT() {
  return typeof window === "undefined" ? "http://localhost:4321" : getBridgeUrl();
}