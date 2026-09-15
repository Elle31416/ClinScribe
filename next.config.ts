import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `next dev` rejects cross-origin requests whose Origin is not allow-listed.
   * Sandboxed/preview hosts proxy the dev server, so allow those hosts here
   * instead of hitting "Cross origin request detected" warnings (and blocked
   * HMR/asset requests) when the app is served behind a proxy.
   */
  allowedDevOrigins: [
    "*.e2b.app",
    "*.vercel.app",
    "localhost",
    "127.0.0.1",
  ],
};

export default nextConfig;
