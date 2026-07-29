export type ChangeKind = "Added" | "Changed" | "Fixed" | "Security" | "Removed" | "Deprecated" | "Other";

export type ChangeGroup = { kind: ChangeKind; items: string[] };
export type Release = {
  version: string;
  date: string | null;
  unreleased: boolean;
  groups: ChangeGroup[];
};

export const KIND_META: Record<ChangeKind, { icon: string; color: string }> = {
  Added: { icon: "🟢", color: "var(--t-green)" },
  Changed: { icon: "🟡", color: "var(--t-amber)" },
  Fixed: { icon: "🔴", color: "var(--t-orange)" },
  Security: { icon: "🔒", color: "#00bfff" },
  Removed: { icon: "⚪", color: "var(--t-dim)" },
  Deprecated: { icon: "⚪", color: "var(--t-dim)" },
  Other: { icon: "▪", color: "var(--t-dim)" },
};

function normalizeKind(raw: string): ChangeKind {
  const k = raw.trim().toLowerCase();
  if (k.startsWith("add")) return "Added";
  if (k.startsWith("chang")) return "Changed";
  if (k.startsWith("fix")) return "Fixed";
  if (k.startsWith("secur")) return "Security";
  if (k.startsWith("remov")) return "Removed";
  if (k.startsWith("deprec")) return "Deprecated";
  return "Other";
}

/** Parses a "Keep a Changelog" formatted markdown document. */
export function parseChangelog(md: string): Release[] {
  const lines = (md || "").split(/\r?\n/);
  const releases: Release[] = [];
  let cur: Release | null = null;
  let group: ChangeGroup | null = null;

  for (const line of lines) {
    const h2 = /^##\s+(.*)$/.exec(line);
    if (h2) {
      const head = h2[1].trim();
      const version = (/\[([^\]]+)\]/.exec(head)?.[1] ?? head.split(/\s+-\s+/)[0]).trim();
      const date = /(\d{4}-\d{2}-\d{2})/.exec(head)?.[1] ?? null;
      cur = { version, date, unreleased: /unreleased/i.test(version), groups: [] };
      group = null;
      releases.push(cur);
      continue;
    }
    const h3 = /^###\s+(.*)$/.exec(line);
    if (h3 && cur) {
      group = { kind: normalizeKind(h3[1]), items: [] };
      cur.groups.push(group);
      continue;
    }
    const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li && cur) {
      if (!group) {
        group = { kind: "Other", items: [] };
        cur.groups.push(group);
      }
      group.items.push(li[1].trim());
    }
  }
  return releases.filter((r) => r.groups.some((g) => g.items.length) || r.unreleased);
}

/** Strips markdown emphasis/links so bullets render as plain terminal text. */
export function plain(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1");
}
