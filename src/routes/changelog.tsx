import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { fetchRaw } from "@/lib/github-db";
import { KIND_META, parseChangelog, plain, type ChangeKind } from "@/lib/changelog";

export const Route = createFileRoute("/changelog")({
  head: () => ({
    meta: [
      { title: "SANDBOX // CHANGELOG_TIMELINE" },
      {
        name: "description",
        content:
          "Release timeline for the SANDBOX repo database interface, parsed live from the repository root CHANGELOG.md.",
      },
      { property: "og:title", content: "SANDBOX // CHANGELOG_TIMELINE" },
      {
        property: "og:description",
        content: "Keep-a-Changelog release timeline parsed straight from the repo root.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChangelogPage,
});

const FILTERS: ChangeKind[] = ["Added", "Changed", "Fixed", "Security"];

function ChangelogPage() {
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("sandbox");
  const [branch] = useState("main");
  const [raw, setRaw] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState<ChangeKind | null>(null);

  useEffect(() => {
    setOwner(localStorage.getItem("activeOwner") ?? "");
    setRepo(localStorage.getItem("activeRepo") ?? "sandbox");
  }, []);

  useEffect(() => {
    if (!owner || !repo) return;
    let dead = false;
    setRaw(null);
    setErr(null);
    fetchRaw(owner, repo, branch, "CHANGELOG.md")
      .then((t) => !dead && setRaw(t))
      .catch((e) => !dead && setErr(String(e?.message ?? e)));
    return () => {
      dead = true;
    };
  }, [owner, repo, branch]);

  const releases = useMemo(() => (raw ? parseChangelog(raw) : []), [raw]);

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-30 border-b border-hard bg-black">
        <div className="mx-auto flex w-full max-w-[2200px] flex-wrap items-center gap-3 px-3 py-3 sm:px-4 2xl:px-10">
          <Link
            to="/"
            className="min-h-11 sm:min-h-9 inline-flex items-center border border-hard px-3 text-[10px] uppercase tracking-widest text-[#888] hover:text-[#00ff66]"
          >
            ← DB
          </Link>
          <h1 className="text-[12px] font-bold tracking-wider sm:text-[13px]">
            SANDBOX <span className="text-[#333]">//</span>{" "}
            <span className="text-[#00ff66]">CHANGELOG_TIMELINE</span>
          </h1>
          <span className="ml-auto truncate text-[10px] uppercase tracking-widest text-[#666]">
            {owner || "___"}/{repo || "___"} @ {branch}/CHANGELOG.md
          </span>
        </div>
        <div className="mx-auto flex w-full max-w-[2200px] flex-wrap gap-2 border-t border-hard px-3 py-2 sm:px-4 2xl:px-10">
          {FILTERS.map((k) => {
            const on = active === k;
            return (
              <button
                key={k}
                onClick={() => setActive(on ? null : k)}
                className="min-h-9 inline-flex items-center border px-3 text-[10px] uppercase tracking-widest"
                style={{
                  borderColor: on ? KIND_META[k].color : "#333",
                  color: on ? "#000" : KIND_META[k].color,
                  backgroundColor: on ? KIND_META[k].color : "transparent",
                }}
              >
                {KIND_META[k].icon} {k}
              </button>
            );
          })}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1100px] px-3 py-6 sm:px-6 2xl:py-10">
        {!owner ? (
          <pre className="border border-hard p-4 text-[11px] text-[#ff5500]">
            &gt; NO_DB_CONFIGURED — bind GITHUB_OWNER/REPO on the main dashboard first.
          </pre>
        ) : err ? (
          <pre className="whitespace-pre-wrap border border-hard p-4 text-[11px] text-[#ff5500]">
            ERR: {err}
          </pre>
        ) : raw === null ? (
          <pre className="text-[11px] text-[#666]">&gt; LOADING_CHANGELOG_FROM_RAW_CDN...</pre>
        ) : releases.length === 0 ? (
          <pre className="text-[11px] text-[#666]">&gt; NO_RELEASE_RECORDS_PARSED</pre>
        ) : (
          <ol className="relative border-l border-hard pl-4 sm:pl-6">
            {releases.map((r) => {
              const groups = active ? r.groups.filter((g) => g.kind === active) : r.groups;
              if (active && groups.length === 0) return null;
              return (
                <li key={r.version} className="relative mb-8">
                  <span
                    className="absolute -left-[21px] top-2 h-2 w-2 sm:-left-[29px]"
                    style={{ backgroundColor: r.unreleased ? "#ff5500" : "#00ff66" }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="border border-[#00ff66] px-2 py-1 text-[11px] font-bold tracking-widest text-[#00ff66]">
                      v{r.version.replace(/^v/i, "")}
                    </span>
                    <span className="border border-hard px-2 py-1 text-[10px] uppercase tracking-widest text-[#888]">
                      {r.date ?? "UNSCHEDULED"}
                    </span>
                  </div>
                  {groups.length === 0 ? (
                    <p className="mt-3 text-[11px] uppercase tracking-widest text-[#555]">
                      NO_ENTRIES_YET
                    </p>
                  ) : (
                    <div className="mt-3 space-y-4">
                      {groups.map((g) => (
                        <section key={g.kind} className="border border-hard">
                          <h2
                            className="border-b border-hard px-3 py-2 text-[10px] uppercase tracking-widest"
                            style={{ color: KIND_META[g.kind].color }}
                          >
                            {KIND_META[g.kind].icon} {g.kind}
                          </h2>
                          <ul className="space-y-2 px-3 py-3">
                            {g.items.map((it, i) => (
                              <li key={i} className="text-[13px] leading-6 text-[#ddd]">
                                <span className="text-[#333]">—</span> {plain(it)}
                              </li>
                            ))}
                          </ul>
                        </section>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </main>
    </div>
  );
}
