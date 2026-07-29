import { MarkdownView } from "@/components/md/MarkdownView";
import { README_CONTENT } from "@/lib/readme-content";
import { useState } from "react";
import { toast } from "sonner";

export function ReadmeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(README_CONTENT);
      setCopied(true);
      toast.success("README_COPIED");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("CLIPBOARD_BLOCKED");
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[var(--t-bg)]/80 p-2 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl border border-[var(--t-green)] bg-[var(--t-bg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-hard bg-[var(--t-bg)] px-4 py-3">
          <div className="text-[12px] uppercase tracking-widest text-[var(--t-green)]">
            📖 README // SPEC_DASH_GITHUB_AS_A_DATABASE
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={copy}
              className="min-h-9 border border-[var(--t-line)] px-3 text-[11px] uppercase tracking-widest text-[var(--t-dim)] hover:border-[var(--t-green)] hover:text-[var(--t-green)]"
              title="Copy README as raw markdown"
            >
              {copied ? "[ COPIED ]" : "📋 COPY"}
            </button>
            <button
              onClick={onClose}
              className="min-h-9 min-w-9 border border-[var(--t-line)] px-2 text-[11px] uppercase tracking-widest text-[var(--t-dim)] hover:border-[var(--t-orange)] hover:text-[var(--t-orange)]"
              aria-label="Close README"
            >
              [X]
            </button>
          </div>
        </div>
        <div className="max-h-[80vh] overflow-y-auto px-5 py-6 text-[14px] leading-7">
          <MarkdownView
            source={README_CONTENT}
            ctx={{
              owner: "",
              repo: "",
              branch: "main",
              currentPath: "README.md",
              exists: () => false,
              onOpen: () => {},
            }}
          />
        </div>
      </div>
    </div>
  );
}