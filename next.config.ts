import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Monatriq repo lives inside the user's home directory, which itself
  // has an unrelated package-lock.json elsewhere on disk. Pin the
  // workspace root explicitly so Next.js/Turbopack don't try to infer it
  // by walking up past this project.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
