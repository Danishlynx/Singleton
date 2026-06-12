"use client";

import Image from "next/image";
import { useState } from "react";

/**
 * Poster with a graceful failure mode: if the remote image can't load (private
 * Drive file, dead link, blocked hotlink), fall back to the calm gradient
 * instead of a broken-image glyph. Client component because onError is needed.
 */
export function PosterImage({
  src,
  alt,
  sizes,
  priority = false,
}: {
  src: string;
  alt: string;
  sizes: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  // Rendered inside a `relative` fixed-height wrapper (same contract as `fill`).
  if (failed) {
    return (
      <div
        className="absolute inset-0 bg-gradient-to-r from-primary/15 via-accent to-primary/5"
        aria-hidden="true"
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      sizes={sizes}
      className="object-cover"
      onError={() => setFailed(true)}
    />
  );
}
