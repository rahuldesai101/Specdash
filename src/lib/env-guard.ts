/** .env.example diffing + hardcoded secret detection. */

export type EnvKey = { key: string; example: string; required: boolean };

export type SecretHit = {
  id: string;
  file: string;
  line: number;
  kind: string;
  masked: string;
  severity: "high" | "medium";
  snippet: string;
};

export function isEnvExamplePath(p: string) {
  const n = p.split("/").pop()?.toLowerCase() ?? "";
  return /^\.env(\.(example|sample|template|dist|local\.example))?$/.test(n) || n === "env.example";
}

/** Files worth scanning for hardcoded credentials. */
export function isScannablePath(p: string) {
  const n = p.toLowerCase();
  if (/(^|\/)(node_modules|dist|build|vendor|\.git)\//.test(n)) return false;
  if (/\.(min\.js|lock|png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|pdf|zip)$/.test(n)) return false;
  return /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|php|env|yml|yaml|json|toml|sh|md)$/.test(n);
}

export function parseEnvFile(text: string): EnvKey[] {
  const out: EnvKey[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const value = m[2].replace(/^["']|["']$/g, "").trim();
    out.push({ key: m[1], example: value, required: value === "" || /change|your|xxx|placeholder|<.*>/i.test(value) });
  }
  return out;
}

export function maskValue(v: string) {
  const s = v.trim();
  if (s.length <= 8) return `${s.slice(0, 2)}****`;
  const pre = s.slice(0, Math.min(6, s.indexOf("_") + 1 || 4));
  return `${pre}****${s.slice(-4)}`;
}

type Rule = { kind: string; re: RegExp; severity: "high" | "medium" };

const RULES: Rule[] = [
  { kind: "OPENAI_KEY", re: /\bsk-[A-Za-z0-9_-]{20,}\b/g, severity: "high" },
  { kind: "ANTHROPIC_KEY", re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g, severity: "high" },
  { kind: "GITHUB_TOKEN", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, severity: "high" },
  { kind: "AWS_ACCESS_KEY", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, severity: "high" },
  { kind: "GOOGLE_API_KEY", re: /\bAIza[0-9A-Za-z_-]{30,}\b/g, severity: "high" },
  { kind: "SLACK_TOKEN", re: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, severity: "high" },
  { kind: "STRIPE_KEY", re: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g, severity: "high" },
  { kind: "PRIVATE_KEY", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g, severity: "high" },
  { kind: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, severity: "high" },
  {
    kind: "INLINE_SECRET_ASSIGNMENT",
    re: /\b(?:api[_-]?key|secret|password|passwd|token|client[_-]?secret)\b["']?\s*[:=]\s*["'`]([^"'`\s]{8,})["'`]/gi,
    severity: "medium",
  },
];

const SAFE = /(process\.env|import\.meta\.env|os\.environ|getenv|\$\{|<%|example|placeholder|your[_-]?|xxx|dummy|changeme|\*{4})/i;

export function scanSecrets(file: string, text: string): SecretHit[] {
  const hits: SecretHit[] = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (line.length > 800) return;
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = rule.re.exec(line))) {
        const value = m[1] ?? m[0];
        if (SAFE.test(value) || (rule.severity === "medium" && SAFE.test(line))) continue;
        hits.push({
          id: `${file}:${idx}:${rule.kind}:${hits.length}`,
          file,
          line: idx + 1,
          kind: rule.kind,
          masked: maskValue(value),
          severity: rule.severity,
          snippet: line.trim().slice(0, 160).replace(value, maskValue(value)),
        });
        if (hits.length > 200) return;
      }
    }
  });
  return hits;
}

/** Env keys referenced in source (process.env.X / import.meta.env.X / os.environ["X"]). */
export function referencedEnvKeys(text: string): string[] {
  const out = new Set<string>();
  const res = [
    /process\.env\.([A-Z0-9_]{2,})/g,
    /process\.env\[["']([A-Z0-9_]{2,})["']\]/g,
    /import\.meta\.env\.([A-Z0-9_]{2,})/g,
    /os\.environ(?:\.get)?[[(]["']([A-Z0-9_]{2,})["']/g,
  ];
  for (const re of res) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) out.add(m[1]);
  }
  return [...out];
}