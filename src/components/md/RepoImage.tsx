import { useEffect, useState } from "react";
import { getPat } from "@/lib/github-db";

export function RepoImage({ src, alt }: { src: string; alt: string }) {
  const [url, setUrl] = useState(src);

  useEffect(() => {
    setUrl(src);
    const pat = getPat();
    if (!pat || !src.startsWith("https://raw.githubusercontent.com/")) return;
    let revoked = "";
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(src, { headers: { Authorization: `Bearer ${pat}` } });
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
  }, [src]);

  return <img src={url} alt={alt} loading="lazy" className="max-w-full border border-hard" />;
}
