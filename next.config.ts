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
};

export default nextConfig;
