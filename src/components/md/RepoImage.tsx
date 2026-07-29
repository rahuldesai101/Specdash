import { useEffect, useState } from "react";
import { getPat } from "@/lib/github-db";
import { safeImageSrc } from "@/lib/url-safety";

export function RepoImage({ src, alt }: { src: string; alt: string }) {
  const safe = safeImageSrc(src);
  const [url, setUrl] = useState(safe);

  useEffect(() => {
    setUrl(safe);
    const pat = getPat();
    // The PAT is only ever attached to GitHub's own raw CDN — never to an
    // arbitrary host referenced from untrusted markdown.
    if (!pat || !safe.startsWith("https://raw.githubusercontent.com/")) return;
    let revoked = "";
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(safe, { headers: { Authorization: `Bearer ${pat}` } });
        if (!res.ok) return;
        const blob = await res.blob();
        if (cancelled) return;
        revoked = URL.createObjectURL(blob);
        setUrl(revoked);
      } catch {
        /* keep public url */
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [safe]);

  if (!url) return <span className="text-[10px] text-[var(--t-dim-2)]">[ BLOCKED_IMAGE_SRC ]</span>;
  return <img src={url} alt={alt} loading="lazy" className="max-w-full border border-hard" />;
}
