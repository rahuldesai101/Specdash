import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Mermaid } from "./Mermaid";
import { DiagramCanvas } from "./DiagramCanvas";
import { parseWorkflow } from "@/lib/workflow-graph";
import { RepoImage } from "./RepoImage";
import { blobUrl, isExternal, rawUrl, resolveRelativePath, slugify } from "@/lib/path-resolve";

export type MdRepoCtx = {
  owner: string;
  repo: string;
  branch: string;
  currentPath: string;
  exists: (path: string) => boolean;
  onOpen: (path: string) => void;
};

function textOf(children: React.ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textOf).join("");
  if (children && typeof children === "object" && "props" in (children as any))
    return textOf((children as any).props?.children);
  return "";
}

function MarkdownViewImpl({ source, ctx }: { source: string; ctx?: MdRepoCtx }) {
  const resolve = (href: string) => resolveRelativePath(ctx?.currentPath ?? "", href.split(/[?#]/)[0]);

  return (
    <div className="text-[12px] leading-relaxed text-[#ccc] space-y-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 id={slugify(textOf(children))} className="text-[16px] font-bold text-[#00ff66] uppercase tracking-wider border-b border-hard pb-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 id={slugify(textOf(children))} className="text-[14px] font-bold text-white uppercase tracking-wider border-b border-hard pb-1">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 id={slugify(textOf(children))} className="text-[12px] font-bold text-[#00ff66] uppercase tracking-widest">{children}</h3>
          ),
          p: ({ children }) => <p className="text-[#ccc]">{children}</p>,
          a: ({ children, href }) => {
            const cls =
              "text-[#00ff66] underline underline-offset-2 hover:bg-[#00ff66] hover:text-black cursor-pointer";
            const h = href ?? "";
            if (!h || isExternal(h)) {
              return (
                <a href={h} target="_blank" rel="noopener noreferrer" className={cls}>
                  {children}
                </a>
              );
            }
            if (h.startsWith("#")) {
              return (
                <a
                  href={h}
                  className={cls}
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .getElementById(decodeURIComponent(h.slice(1)))
                      ?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  {children}
                </a>
              );
            }
            if (!ctx) {
              return (
                <a href={h} target="_blank" rel="noopener noreferrer" className={cls}>
                  {children}
                </a>
              );
            }
            const resolved = resolve(h);
            const gh = blobUrl(ctx.owner, ctx.repo, ctx.branch, resolved);
            if (/\.md$/i.test(resolved)) {
              return (
                <a
                  href={gh}
                  className={cls}
                  onClick={(e) => {
                    e.preventDefault();
                    if (ctx.exists(resolved)) {
                      ctx.onOpen(resolved);
                    } else {
                      toast.error(`File [${resolved}] not found in repository index.`);
                      window.open(gh, "_blank", "noopener,noreferrer");
                    }
                  }}
                >
                  {children}
                </a>
              );
            }
            return (
              <a href={gh} target="_blank" rel="noopener noreferrer" className={cls}>
                {children}
              </a>
            );
          },
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1 marker:text-[#00ff66]">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1 marker:text-[#00ff66]">{children}</ol>,
          li: ({ children }) => <li className="text-[#ccc]">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-[#00ff66] pl-3 text-[#888] italic">{children}</blockquote>
          ),
          hr: () => <hr className="border-hard" />,
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[11px]">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-hard px-2 py-1 text-left text-[10px] uppercase tracking-widest text-[#666] font-normal">
              {children}
            </th>
          ),
          td: ({ children }) => <td className="border border-hard px-2 py-1 align-top">{children}</td>,
          input: (props) => <input {...props} readOnly className="mr-2 accent-[#00ff66]" />,
          img: ({ src, alt }) => {
            const raw = typeof src === "string" ? src : "";
            const url =
              !raw || isExternal(raw) || raw.startsWith("data:") || !ctx
                ? raw
                : rawUrl(ctx.owner, ctx.repo, ctx.branch, resolve(raw));
            return <RepoImage src={url} alt={alt ?? ""} />;
          },
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }) => {
            const text = String(children ?? "").replace(/\n$/, "");
            const lang = /language-(\w+)/.exec(className ?? "")?.[1];
            if (lang === "mermaid") return <Mermaid chart={text} />;
            if (lang && /^(ya?ml|json)$/i.test(lang)) {
              const wf = parseWorkflow(text);
              if (wf)
                return (
                  <DiagramCanvas
                    chart={wf.mermaid}
                    label={`${wf.kind.toUpperCase()} // ${wf.title}`}
                    raw={text}
                    rawLang={lang}
                  />
                );
            }
            if (!className) {
              return (
                <code className="border border-hard bg-[#0a0a0a] px-1 py-0.5 text-[#00ff66]" {...props}>
                  {text}
                </code>
              );
            }
            return (
              <pre className="border border-hard bg-[#0a0a0a] p-3 overflow-x-auto">
                <div className="text-[9px] uppercase tracking-widest text-[#555] mb-2">[ CODE{lang ? `: ${lang}` : ""} ]</div>
                <code className="text-[11px] text-[#ccc] whitespace-pre">{text}</code>
              </pre>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Re-render guard: the markdown component map is recreated on every render, so
 * any parent re-render would remount heavy children (mermaid canvases) and wipe
 * their zoom/pan state. Only re-render when the source or repo context changes.
 */
export const MarkdownView = memo(
  MarkdownViewImpl,
  (a, b) =>
    a.source === b.source &&
    a.ctx?.owner === b.ctx?.owner &&
    a.ctx?.repo === b.ctx?.repo &&
    a.ctx?.branch === b.ctx?.branch &&
    a.ctx?.currentPath === b.ctx?.currentPath,
);
