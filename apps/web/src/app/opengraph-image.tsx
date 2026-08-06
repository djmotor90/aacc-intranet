/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "AITIM Intranet";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Share-card image for Telegram, Slack, iMessage, etc. */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(145deg, #0f172a 0%, #1e3a8a 55%, #2563eb 100%)",
          color: "#fff",
          padding: 72,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 16,
              background: "#fff",
              color: "#1d4ed8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 40,
              fontWeight: 800,
            }}
          >
            A
          </div>
          <div style={{ fontSize: 28, fontWeight: 600, opacity: 0.9 }}>AITIM Group</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: -1.5, lineHeight: 1.05 }}>
            AITIM Intranet
          </div>
          <div style={{ fontSize: 32, fontWeight: 500, opacity: 0.88, maxWidth: 900 }}>
            Tasks, workspaces, and internal tools for the team
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
