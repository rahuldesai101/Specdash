import { useMemo, useState } from "react";
import { newFileIntentUrl, TEMPLATES } from "@/lib/git-intent";

export function NewSpecModal({
  owner,
  repo,
  branch,
  folders,
  activeDir,
  onClose,
}: {
  owner: string;
  repo: string;
  branch: string;
  folders: string[];
  activeDir: string | null;
  onClose: () => void;
}) {
  const [folder, setFolder] = useState(activeDir ?? "root");
  const [customFolder, setCustomFolder] = useState("");
  const [fileName, setFileName] = useState("");
  const [tpl, setTpl] = useState("IDEA");
  const [content, setContent] = useState(TEMPLATES.IDEA.body("NEW_SPEC"));

  const targetFolder = folder === "__custom" ? customFolder.replace(/^\/|\/$/g, "") : folder;
  const finalName = fileName.trim() ? (/\.md$/i.test(fileName.trim()) ? fileName.trim() : `${fileName.trim()}.md`) : "";

  const url = useMemo(
    () =>
      newFileIntentUrl({
        owner,
        repo,
        branch,
        folder: targetFolder,
        fileName: finalName || "untitled.md",
        content,
      }),
    [owner, repo, branch, targetFolder, finalName, content],
  );

  const applyTemplate = (key: string) => {
    setTpl(key);
    setContent(TEMPLATES[key].body(finalName.replace(/\.md$/i, "") || "NEW_SPEC"));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div className="w-full max-w-4xl h-[90vh] flex flex-col bg-black border border-hard">
        <div className="flex items-center justify-between border-b border-hard px-5 py-3">
          <div className="text-[12px] uppercase tracking-widest text-[#00ff66]">
            [ NEW_SPEC ] INSERT INTO {owner}/{repo}@{branch}
          </div>
          <button onClick={onClose} className="text-[11px] text-[#666] hover:text-white">
            [X CLOSE]
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 border-b border-hard px-5 py-4 text-[11px]">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-widest text-[#666] mb-1">TARGET_FOLDER</span>
            <select
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              className="w-full bg-black border border-hard px-2 py-2 text-white"
            >
              {folders.map((d) => (
                <option key={d} value={d}>
                  /{d}
                </option>
              ))}
              <option value="__custom">+ CUSTOM_PATH…</option>
            </select>
            {folder === "__custom" && (
              <input
                value={customFolder}
                onChange={(e) => setCustomFolder(e.target.value)}
                placeholder="docs/research"
                className="mt-2 w-full bg-black border border-hard px-2 py-2 text-white"
              />
            )}
          </label>

          <label className="block">
            <span className="block text-[10px] uppercase tracking-widest text-[#666] mb-1">FILE_NAME</span>
            <input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="IDE-004-title.md"
              className="w-full bg-black border border-hard px-2 py-2 text-white"
            />
          </label>

          <label className="block">
            <span className="block text-[10px] uppercase tracking-widest text-[#666] mb-1">TEMPLATE</span>
            <select
              value={tpl}
              onChange={(e) => applyTemplate(e.target.value)}
              className="w-full bg-black border border-hard px-2 py-2 text-white"
            >
              {Object.entries(TEMPLATES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex-1 flex flex-col px-5 py-4 min-h-0">
          <span className="block text-[10px] uppercase tracking-widest text-[#666] mb-2">
            MARKDOWN_BODY — /{targetFolder === "root" ? "" : `${targetFolder}/`}
            {finalName || "untitled.md"}
          </span>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full bg-[#050505] border border-hard px-3 py-3 text-[13px] leading-6 text-[#ccc] resize-none"
          />
        </div>

        <div className="border-t border-hard px-5 py-4 flex flex-wrap items-center gap-3">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!finalName}
            onClick={(e) => {
              if (!finalName) e.preventDefault();
            }}
            className="border px-4 py-2 text-[11px] uppercase tracking-widest"
            style={{
              borderColor: finalName ? "#00ff66" : "#333",
              color: finalName ? "#00ff66" : "#555",
            }}
          >
            [ COMMIT TO GITHUB ↗ ]
          </a>
          <p className="text-[10px] text-[#555] max-w-xl">
            Opens GitHub web editor. If you do not have write access, GitHub will automatically create a fork and Pull
            Request for you.
          </p>
        </div>
      </div>
    </div>
  );
}
