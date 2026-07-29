/** Manifest parsing for the Dependency Radar. */

export type Dep = {
  name: string;
  range: string;
  scope: "direct" | "dev" | "peer" | "optional";
  ecosystem: string;
  risk?: string;
};

export type Manifest = { path: string; ecosystem: string; deps: Dep[]; license?: string; name?: string };

export const MANIFEST_NAMES = [
  "package.json",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
];

export function isManifestPath(p: string) {
  const n = p.split("/").pop() ?? "";
  const depth = p.split("/").length;
  return depth <= 3 && MANIFEST_NAMES.includes(n);
}

function riskOf(range: string): string | undefined {
  const r = range.trim();
  if (!r || r === "*" || r === "latest") return "UNPINNED — resolves to latest, breaking changes possible";
  if (/^[\^~]?0\./.test(r)) return "PRE-1.0 — minor bumps may break";
  if (/^>=?\s*\d/.test(r) && !/<|,/.test(r)) return "OPEN RANGE — no upper bound";
  if (/^\^/.test(r)) return undefined;
  return undefined;
}

export function parsePackageJson(path: string, text: string): Manifest | null {
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const deps: Dep[] = [];
  const push = (obj: any, scope: Dep["scope"]) => {
    for (const [name, range] of Object.entries<any>(obj ?? {})) {
      deps.push({ name, range: String(range), scope, ecosystem: "npm", risk: riskOf(String(range)) });
    }
  };
  push(json.dependencies, "direct");
  push(json.devDependencies, "dev");
  push(json.peerDependencies, "peer");
  push(json.optionalDependencies, "optional");
  return {
    path,
    ecosystem: "npm",
    deps,
    license: typeof json.license === "string" ? json.license : undefined,
    name: json.name,
  };
}

export function parseRequirements(path: string, text: string): Manifest {
  const deps: Dep[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("#")[0].trim();
    if (!line || line.startsWith("-")) continue;
    const m = line.match(/^([A-Za-z0-9._-]+)\s*(\[.*\])?\s*(.*)$/);
    if (!m) continue;
    const range = m[3].trim();
    deps.push({ name: m[1], range: range || "*", scope: "direct", ecosystem: "pypi", risk: riskOf(range) });
  }
  return { path, ecosystem: "pypi", deps };
}

export function parseCargoToml(path: string, text: string): Manifest {
  const deps: Dep[] = [];
  let section = "";
  let license: string | undefined;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) {
      section = sec[1];
      continue;
    }
    if (section === "package") {
      const lm = line.match(/^license\s*=\s*"([^"]+)"/);
      if (lm) license = lm[1];
      continue;
    }
    if (!/dependencies$/.test(section)) continue;
    const m = line.match(/^([A-Za-z0-9._-]+)\s*=\s*(.+)$/);
    if (!m) continue;
    const rawVal = m[2].trim();
    const ver = rawVal.startsWith("{")
      ? (rawVal.match(/version\s*=\s*"([^"]+)"/)?.[1] ?? "*")
      : rawVal.replace(/^"|"$/g, "");
    const scope: Dep["scope"] = section.startsWith("dev") ? "dev" : section.startsWith("build") ? "dev" : "direct";
    deps.push({ name: m[1], range: ver, scope, ecosystem: "crates.io", risk: riskOf(ver) });
  }
  return { path, ecosystem: "crates.io", deps, license };
}

export function parseGoMod(path: string, text: string): Manifest {
  const deps: Dep[] = [];
  let inBlock = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split("//")[0].trim();
    if (!line) continue;
    if (/^require\s*\($/.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock && line === ")") {
      inBlock = false;
      continue;
    }
    let body = line;
    if (!inBlock) {
      if (!/^require\s+/.test(line)) continue;
      body = line.replace(/^require\s+/, "");
    }
    const m = body.match(/^([^\s]+)\s+(v[^\s]+)/);
    if (!m) continue;
    const indirect = /\/\/\s*indirect/.test(raw);
    deps.push({
      name: m[1],
      range: m[2],
      scope: indirect ? "peer" : "direct",
      ecosystem: "go",
      risk: riskOf(m[2].replace(/^v/, "")),
    });
  }
  return { path, ecosystem: "go", deps };
}

export function parsePyproject(path: string, text: string): Manifest {
  const deps: Dep[] = [];
  let license: string | undefined;
  const block = text.match(/dependencies\s*=\s*\[([^\]]*)\]/);
  if (block) {
    for (const item of block[1].split(",")) {
      const s = item.trim().replace(/^["']|["']$/g, "");
      if (!s) continue;
      const m = s.match(/^([A-Za-z0-9._-]+)\s*(.*)$/);
      if (m) deps.push({ name: m[1], range: m[2] || "*", scope: "direct", ecosystem: "pypi", risk: riskOf(m[2]) });
    }
  }
  const lm = text.match(/license\s*=\s*[{"']?\s*(?:text\s*=\s*)?["']([^"']+)["']/);
  if (lm) license = lm[1];
  return { path, ecosystem: "pypi", deps, license };
}

export function parseManifest(path: string, text: string): Manifest | null {
  const name = path.split("/").pop() ?? "";
  if (name === "package.json") return parsePackageJson(path, text);
  if (name === "requirements.txt") return parseRequirements(path, text);
  if (name === "Cargo.toml") return parseCargoToml(path, text);
  if (name === "go.mod") return parseGoMod(path, text);
  if (name === "pyproject.toml") return parsePyproject(path, text);
  return null;
}

/** Normalize an SPDX-ish license into a display family. */
export function licenseFamily(l?: string) {
  if (!l) return "UNKNOWN";
  const s = l.toUpperCase();
  if (s.includes("MIT")) return "MIT";
  if (s.includes("APACHE")) return "APACHE-2.0";
  if (s.includes("AGPL")) return "AGPL";
  if (s.includes("LGPL")) return "LGPL";
  if (s.includes("GPL")) return "GPL";
  if (s.includes("BSD")) return "BSD";
  if (s.includes("MPL")) return "MPL";
  if (s.includes("ISC")) return "ISC";
  if (s.includes("UNLICENS")) return "UNLICENSE";
  return s.slice(0, 18);
}

export const COPYLEFT = new Set(["GPL", "AGPL", "LGPL", "MPL"]);