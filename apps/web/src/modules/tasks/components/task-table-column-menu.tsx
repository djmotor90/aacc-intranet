"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TaskTableColumnMenuState {
  x: number;
  y: number;
  /** Column id: base id ("status") or `field-{uuid}`. */
  colId: string;
}

export function TaskTableColumnMenu({
  menu,
  canSort,
  canGroup,
  canEditOptions,
  canCalc,
  canHide,
  isSorted,
  sortDir,
  hasCalc,
  isHidden,
  onSort,
  onGroup,
  onEditOptions,
  onMoveStart,
  onMoveEnd,
  onToggleCalc,
  onHide,
  onClose,
}: {
  menu: TaskTableColumnMenuState;
  canSort: boolean;
  canGroup: boolean;
  canEditOptions: boolean;
  canCalc: boolean;
  canHide: boolean;
  isSorted: boolean;
  sortDir: "asc" | "desc";
  hasCalc: boolean;
  isHidden: boolean;
  onSort: (dir: "asc" | "desc") => void;
  onGroup: () => void;
  onEditOptions: () => void;
  onMoveStart: () => void;
  onMoveEnd: () => void;
  onToggleCalc: () => void;
  onHide: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    const id = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => {
      clearTimeout(id);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  const [position, setPosition] = useState({ top: menu.y, left: menu.x });
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPosition({
      top: Math.min(menu.y, window.innerHeight - rect.height - 8),
      left: Math.min(menu.x, window.innerWidth - rect.width - 8),
    });
  }, [menu.x, menu.y]);

  function item(label: string, onClick: () => void, active = false) {
    return (
      <button
        key={label}
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent",
          active && "font-medium text-primary",
        )}
      >
        {label}
      </button>
    );
  }

  function separator(key: string) {
    return <div key={key} className="my-1 border-t" />;
  }

  const sections: ReactNode[] = [];
  if (canSort) {
    sections.push(
      item(
        "Sort ascending",
        () => {
          onSort("asc");
          onClose();
        },
        isSorted && sortDir === "asc",
      ),
      item(
        "Sort descending",
        () => {
          onSort("desc");
          onClose();
        },
        isSorted && sortDir === "desc",
      ),
    );
  }
  if (canGroup) {
    if (sections.length) sections.push(separator("s-group"));
    sections.push(item("Group by this field", onGroup));
  }
  if (canEditOptions) {
    if (sections.length) sections.push(separator("s-opts"));
    sections.push(item("Edit options", onEditOptions));
  }
  if (sections.length) sections.push(separator("s-move"));
  sections.push(item("Move to start", onMoveStart), item("Move to end", onMoveEnd));
  if (canCalc) {
    sections.push(separator("s-calc"));
    sections.push(item(hasCalc ? "Hide calculation" : "Calculate", onToggleCalc));
  }
  if (canHide) {
    sections.push(separator("s-hide"));
    sections.push(item(isHidden ? "Show column" : "Hide column", onHide));
  }

  return (
    <div
      ref={ref}
      style={{ position: "fixed", top: position.top, left: position.left, zIndex: 9999 }}
      className="min-w-[200px] rounded-lg border bg-popover py-1 shadow-lg"
    >
      {sections}
    </div>
  );
}
