/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo: trace files from the workspace root so workspace packages are included
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Avatar (and similar) server actions: client downscales first; keep headroom for FormData.
  experimental: {
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  // Allow public forms to be embedded (iframe) on other sites / SharePoint.
  // Prefer CSP frame-ancestors; omit X-Frame-Options (DENY/SAMEORIGIN would block embeds).
  async headers() {
    return [
      {
        source: "/forms/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
