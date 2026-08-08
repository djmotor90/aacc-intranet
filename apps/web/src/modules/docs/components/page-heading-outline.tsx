/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
"use client";

import { ListTree } from "lucide-react";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type PageHeading = {
  id: string;
  index: number;
  level: number;
  text: string;
};

function getHeadingElements(editorRoot: HTMLElement): HTMLHeadingElement[] {
  return Array.from(
    editorRoot.querySelectorAll<HTMLHeadingElement>(
      ".aitim-editor h1, .aitim-editor h2, .aitim-editor h3, .aitim-editor h4",
    ),
  );
}

export function PageHeadingOutline({
  pageId,
  editorRootRef,
  scrollRootRef,
  className,
}: {
  pageId: string;
  editorRootRef: RefObject<HTMLDivElement | null>;
  scrollRootRef: RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const [headings, setHeadings] = useState<PageHeading[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    const editorRoot = editorRootRef.current;
    if (!editorRoot) return;

    const collect = () => {
      const next = getHeadingElements(editorRoot)
        .map((element, index) => {
          const text = element.textContent?.trim() ?? "";
          if (!text) return null;
          const id = `doc-heading-${pageId}-${index}`;
          return {
            id,
            index,
            level: Number(element.tagName.slice(1)) || 1,
            text,
          };
        })
        .filter((heading): heading is PageHeading => heading !== null);

      setHeadings((current) => {
        const unchanged =
          current.length === next.length &&
          current.every(
            (heading, index) =>
              heading.id === next[index]?.id &&
              heading.index === next[index]?.index &&
              heading.level === next[index]?.level &&
              heading.text === next[index]?.text,
          );
        return unchanged ? current : next;
      });
    };

    collect();
    let collectFrame = 0;
    const observer = new MutationObserver(() => {
      cancelAnimationFrame(collectFrame);
      collectFrame = requestAnimationFrame(collect);
    });
    observer.observe(editorRoot, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    return () => {
      cancelAnimationFrame(collectFrame);
      observer.disconnect();
    };
  }, [editorRootRef, pageId]);

  useEffect(() => {
    const editorRoot = editorRootRef.current;
    const scrollRoot = scrollRootRef.current;
    if (!editorRoot || !scrollRoot || headings.length === 0) {
      setActiveId(headings[0]?.id ?? null);
      return;
    }

    let frame = 0;
    const updateActiveHeading = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rootTop = scrollRoot.getBoundingClientRect().top;
        const activationLine = rootTop + 112;
        const elements = getHeadingElements(editorRoot);
        let active = headings[0]?.id ?? null;
        for (const heading of headings) {
          const element = elements[heading.index];
          if (!element) continue;
          if (element.getBoundingClientRect().top <= activationLine) active = heading.id;
          else break;
        }
        setActiveId(active);
      });
    };

    updateActiveHeading();
    scrollRoot.addEventListener("scroll", updateActiveHeading, { passive: true });
    window.addEventListener("resize", updateActiveHeading);
    return () => {
      cancelAnimationFrame(frame);
      scrollRoot.removeEventListener("scroll", updateActiveHeading);
      window.removeEventListener("resize", updateActiveHeading);
    };
  }, [editorRootRef, headings, scrollRootRef]);

  useEffect(() => {
    if (!activeId) return;
    itemRefs.current.get(activeId)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [activeId]);

  function scrollToHeading(heading: PageHeading) {
    const editorRoot = editorRootRef.current;
    const element = editorRoot ? getHeadingElements(editorRoot)[heading.index] : null;
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(heading.id);
  }

  return (
    <aside
      aria-label="Page outline"
      className={cn(
        "rounded-xl border border-border/70 bg-background/85 p-3 shadow-sm backdrop-blur",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-foreground">
        <ListTree className="size-3.5 text-primary" />
        Page outline
      </div>
      {headings.length === 0 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Add a heading to build this outline.
        </p>
      ) : (
        <nav className="flex flex-col gap-0.5" aria-label="Headings on this page">
          {headings.map((heading) => (
            <button
              key={heading.id}
              ref={(element) => {
                if (element) itemRefs.current.set(heading.id, element);
                else itemRefs.current.delete(heading.id);
              }}
              type="button"
              onClick={() => scrollToHeading(heading)}
              className={cn(
                "relative w-full truncate rounded-md py-1 pr-2 text-left text-xs transition-colors",
                heading.level === 1 && "pl-2",
                heading.level === 2 && "pl-4",
                heading.level === 3 && "pl-6",
                heading.level >= 4 && "pl-8",
                activeId === heading.id
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              title={heading.text}
            >
              {activeId === heading.id && (
                <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" />
              )}
              {heading.text}
            </button>
          ))}
        </nav>
      )}
    </aside>
  );
}
