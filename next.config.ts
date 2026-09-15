import type { NextConfig } from "next";

/**
 * Headers every response gets.
 *
 * `Permissions-Policy` allow-lists the microphone for all origins on purpose:
 * the app is often embedded in an iframe (preview panes, hackathon dashboards),
 * and a `microphone=(self)` policy would silently break `getUserMedia` in a
 * cross-origin frame. The camera, geolocation, and payment APIs are not needed
 * anywhere, so they are switched off.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: "microphone=*, camera=(), geolocation=(), payment=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  /**
   * `next dev` rejects cross-origin requests whose Origin is not allow-listed.
   * Sandboxed/preview hosts proxy the dev server, so allow those hosts here
   * instead of hitting "Cross origin request detected" warnings (and blocked
   * HMR/asset requests) when the app is served behind a proxy.
   */
  allowedDevOrigins: ["*.e2b.app", "*.vercel.app", "localhost", "127.0.0.1"],

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
