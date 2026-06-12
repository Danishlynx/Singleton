/**
 * Poster-URL normalization: vendors naturally paste SHARE links (Google Drive,
 * Dropbox), which are HTML viewer pages — not image files — and can't render in
 * an <img>. Rewrite the well-known shapes to their direct-image equivalents.
 * Anything unrecognized passes through untouched.
 *
 * Note: the underlying file must still be publicly shared ("Anyone with the
 * link") for the direct host to serve it.
 */
export function normalizeImageUrl(raw: string): string {
  try {
    const u = new URL(raw);

    // Google Drive: /file/d/<id>/view, /open?id=<id>, /uc?id=<id>&export=view
    if (u.hostname === "drive.google.com") {
      const m = u.pathname.match(/\/file\/d\/([^/]+)/);
      const id = m?.[1] ?? u.searchParams.get("id");
      if (id) return `https://lh3.googleusercontent.com/d/${id}`;
    }

    // Dropbox share pages → direct-content host
    if (u.hostname === "www.dropbox.com" || u.hostname === "dropbox.com") {
      u.hostname = "dl.dropboxusercontent.com";
      u.searchParams.delete("dl");
      return u.toString();
    }

    return raw;
  } catch {
    return raw;
  }
}
