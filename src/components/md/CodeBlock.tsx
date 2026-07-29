import { memo, useState } from "react";
import { toast } from "sonner";
import { ExternalAiMenu } from "@/components/ai/ExternalAiMenu";
import { detectVariables } from "@/lib/search-index";

/**
 * Fenced code block with an interactive snippet toolbar:
 * run in playground, copy clean command, or ship it to an external AI chat.
 */
function CodeBlockImpl({
  code,
  lang,
  path = "snippet",
  onRun,
}: {
  code: string;
  lang?: string;
  path?: string;
  onRun?: (code: string, lang: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const vars = detectVariables(code);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success("SNIPPET_COPIED");
      setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error("CLIPBOARD_BLOCKED");
    }
  };

  const btn =
    "border border-[var(--t-line)] px-2 py-1 text-[9px] uppercase tracking-widest text-[var(--t-dim)] hover:border-[var(--t-green)] hover:text-[var(--t-green)]";

  return (
    <div className="group relative border border-hard bg-[var(--t-surface)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--t-surface-2)] px-3 py-2">
        <span className="text-[9px] uppercase tracking-widest text-[var(--t-dim-3)]">
          [ CODE{lang ? `: ${lang}` : ""} ]
        </span>
        {vars.length > 0 && (
          <span className="text-[9px] uppercase tracking-widest text-[var(--t-amber)]">
            [ VARS: {vars.join(", ")} ]
          </span>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {onRun && (
            <button onClick={() => onRun(code, lang ?? "text")} className={btn} title="Alt+P">
              ⚡ RUN IN PLAYGROUND
            </button>
          )}
          <button onClick={copy} className={btn}>
            {copied ? "✓ COPIED" : "📋 COPY COMMAND"}
          </button>
          <ExternalAiMenu
            path={path}
            text={code}
            action="Explain, validate and improve this snippet. Return a corrected version."
            directive="You are a senior engineer reviewing a single code snippet extracted from a repository spec."
            compact
          />
        </div>
      </div>
      <pre className="overflow-x-auto p-3">
        <code className="whitespace-pre text-[11px] text-[var(--t-fg-2)]">{code}</code>
      </pre>
    </div>
  );
}
/** Snippets are immutable strings — re-render only when the code itself changes. */
export const CodeBlock = memo(
  CodeBlockImpl,
  (a, b) => a.code === b.code && a.lang === b.lang && a.path === b.path && a.onRun === b.onRun,
);
