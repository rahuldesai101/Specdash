/**
 * Cleans up messy LLM markdown (common with Groq/Llama):
 * stray/unclosed code fences, escaped asterisks, orphan backticks,
 * over-deep or malformed headings, and excessive blank lines.
 */
export function normalizeAiMarkdown(input: string): string {
  if (!input) return "";
  let s = input.replace(/\r\n/g, "\n");

  // Strip a full-document code fence wrapper (```markdown ... ```)
  const wrapped = s.trim().match(/^```[a-zA-Z]*\n([\s\S]*?)\n?```$/);
  if (wrapped) s = wrapped[1];

  // Un-escape double-escaped markdown symbols
  s = s.replace(/\\\\([*_`#[\]()~-])/g, "$1").replace(/\\([*_`#])/g, "$1");

  const lines = s.split("\n");
  let fenceOpen = false;
  const out: string[] = [];

  for (let line of lines) {
    if (/^\s*`{3,}/.test(line)) {
      fenceOpen = !fenceOpen;
      out.push(line.replace(/^\s*`{3,}\s*/, fenceOpen ? "```" : "```").trimEnd());
      continue;
    }
    if (!fenceOpen) {
      // Normalize headings: `####+` -> `###`, ensure a space after hashes
      line = line.replace(/^(\s*)(#{1,6})\s*/, (_m, sp: string, h: string) => `${sp}${"#".repeat(Math.min(h.length, 3))} `);
      // Normalize bullets to "- "
      line = line.replace(/^(\s*)[*+•]\s+/, "$1- ");
      // Drop a single dangling backtick with no partner on the line
      const ticks = (line.match(/`/g) || []).length;
      if (ticks % 2 === 1) line = line.replace(/`(?=[^`]*$)/, "");
      // Remove empty emphasis artifacts
      line = line.replace(/\*{2,}\s*\*{2,}/g, "").replace(/(^|\s)\*(\s|$)/g, "$1$2");
    }
    out.push(line);
  }

  // Close an unterminated fence
  if (fenceOpen) out.push("```");

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
