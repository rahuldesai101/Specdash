const enc = (p: string) => p.split("/").filter(Boolean).map(encodeURIComponent).join("/");

export function newFileIntentUrl(o: {
  owner: string;
  repo: string;
  branch: string;
  folder: string;
  fileName: string;
  content: string;
}) {
  const folder = o.folder && o.folder !== "root" ? `/${enc(o.folder)}` : "";
  const q = new URLSearchParams({ filename: o.fileName, value: o.content });
  return `https://github.com/${o.owner}/${o.repo}/new/${o.branch}${folder}?${q.toString()}`;
}

export function editFileIntentUrl(o: {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  content?: string;
}) {
  const base = `https://github.com/${o.owner}/${o.repo}/edit/${o.branch}/${enc(o.path)}`;
  return o.content ? `${base}?${new URLSearchParams({ value: o.content }).toString()}` : base;
}

export const TEMPLATES: Record<string, { label: string; body: (name: string) => string }> = {
  BLANK: { label: "[BLANK]", body: () => "" },
  IDEA: {
    label: "[IDEA_TEMPLATE]",
    body: (n) => `# ${n}

## HYPOTHESIS
> One-line thesis.

## PROBLEM
-

## PROPOSED_APPROACH
1.

## RISKS / OPEN_QUESTIONS
- [ ]

## STATUS
DRAFT
`,
  },
  RESEARCH: {
    label: "[RESEARCH_TEMPLATE]",
    body: (n) => `# ${n}

## ABSTRACT

## METHOD

## BENCHMARKS
| METRIC | BASELINE | RESULT |
| --- | --- | --- |
|  |  |  |

## FINDINGS
-

## REFERENCES
-
`,
  },
};
