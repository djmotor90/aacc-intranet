/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { OutreachNav } from "@/modules/outreach/components/outreach-nav";

export default function OutreachLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="-m-6 flex min-h-[calc(100vh-3.5rem)] flex-col bg-background">
      <OutreachNav />
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
    </div>
  );
}
