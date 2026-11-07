import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pages read the session cookie on every request; keep classic dynamic
  // rendering rather than Cache Components so no Suspense boundaries are needed.
  cacheComponents: false,
  // Do not generate AGENTS.md in the repo root.
  agentRules: false,
  devIndicators: false,
};

export default nextConfig;
