import { useState } from "react";
import { toast } from "sonner";
import { ExternalAiMenu } from "@/components/ai/ExternalAiMenu";
import { detectVariables } from "@/lib/search-index";

/**
 * Fenced code block with an interactive snippet toolbar:
 * run in playground, copy clean command, or ship it to an external AI chat.
 */
export function CodeBlock({
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
    "border border-[#333] px-2 py-1 text-[9px] uppercase tracking-widest text-[#888] hover:border-[#00ff66] hover:text-[#00ff66]";

  return (
    <div className="group relative border border-hard bg-[#0a0a0a]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[#161616] px-3 py-2">
        <span className="text-[9px] uppercase tracking-widest text-[#555]">
          [ CODE{lang ? `: ${lang}` : ""} ]
        </span>
        {vars.length > 0 && (
          <span className="text-[9px] uppercase tracking-widest text-[#ffaa00]">
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
        <code className="whitespace-pre text-[11px] text-[#ccc]">{code}</code>
      </pre>
    </div>
  );
}