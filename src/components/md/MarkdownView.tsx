import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Mermaid } from "./Mermaid";

export function MarkdownView({ source }: { source: string }) {
  return (
    <div className="text-[12px] leading-relaxed text-[#ccc] space-y-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-[16px] font-bold text-[#00ff66] uppercase tracking-wider border-b border-hard pb-2">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[14px] font-bold text-white uppercase tracking-wider border-b border-hard pb-1">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-[12px] font-bold text-[#00ff66] uppercase tracking-widest">{children}</h3>
          ),
          p: ({ children }) => <p className="text-[#ccc]">{children}</p>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-[#00ff66] underline underline-offset-2 hover:bg-[#00ff66] hover:text-black"
            >
              {children}
            </a>
          ),
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
          img: ({ src, alt }) => (
            <img src={typeof src === "string" ? src : ""} alt={alt ?? ""} loading="lazy" className="max-w-full border border-hard" />
          ),
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children, ...props }) => {
            const text = String(children ?? "").replace(/\n$/, "");
            const lang = /language-(\w+)/.exec(className ?? "")?.[1];
            if (lang === "mermaid") return <Mermaid chart={text} />;
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
