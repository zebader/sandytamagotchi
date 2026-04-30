import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** This app’s directory (must be explicit when a parent folder has another lockfile — Next would pick the wrong Turbopack root). */
const appRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: appRoot,
  },
};

export default nextConfig;
