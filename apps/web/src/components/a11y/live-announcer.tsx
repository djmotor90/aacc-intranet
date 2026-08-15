"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useEffect, useState } from "react";

const EVENT = "aitim:announce";

type Politeness = "polite" | "assertive";

/** Announce a short status to screen readers (WCAG 4.1.3 Status Messages). */
export function announce(message: string, politeness: Politeness = "polite") {
  if (typeof window === "undefined" || !message.trim()) return;
  window.dispatchEvent(
    new CustomEvent(EVENT, { detail: { message: message.trim(), politeness } }),
  );
}

export function LiveAnnouncer() {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");

  useEffect(() => {
    function onAnnounce(event: Event) {
      const detail = (event as CustomEvent<{ message?: string; politeness?: Politeness }>).detail;
      const message = detail?.message ?? "";
      if (!message) return;
      if (detail.politeness === "assertive") {
        setAssertive("");
        requestAnimationFrame(() => setAssertive(message));
      } else {
        setPolite("");
        requestAnimationFrame(() => setPolite(message));
      }
    }
    window.addEventListener(EVENT, onAnnounce);
    return () => window.removeEventListener(EVENT, onAnnounce);
  }, []);

  return (
    <>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {polite}
      </div>
      <div aria-live="assertive" aria-atomic="true" className="sr-only">
        {assertive}
      </div>
    </>
  );
}
