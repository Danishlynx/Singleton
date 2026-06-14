import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the file-tracing root to this project (a stray lockfile in the home dir
  // otherwise makes Next infer the wrong workspace root).
  outputFileTracingRoot: path.resolve("."),
  // Keep the Node-only DB stack out of the bundler so `pg` + the AWS SDK load via
  // native require at runtime (Node runtime only — never Edge). `pg` is already in
  // Next's default external list; the DSQL connector is added explicitly.
  serverExternalPackages: ["@aws/aurora-dsql-node-postgres-connector", "pg"],
  // Vendor poster images are arbitrary https URLs supplied per release.
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  // Defense-in-depth for the admin magic link: never attach a Referer (which
  // could otherwise carry a token-bearing URL) to subresource requests from the
  // admin area. The token now travels in the fragment, but this is a free backstop.
  async headers() {
    return [
      {
        source: "/admin/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        source: "/admin",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
