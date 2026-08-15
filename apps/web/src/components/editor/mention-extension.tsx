"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import Mention from "@tiptap/extension-mention";
import { PluginKey } from "@tiptap/pm/state";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { AtSign, UsersRound } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { solidChipStyle } from "@/lib/color-contrast";
import { cn } from "@/lib/utils";

export const mentionPluginKey = new PluginKey("mentionSuggestion");

export type MentionUser = {
  id: string;
  displayName: string;
  photoKey?: string | null;
  kind?: "user" | "team";
  alias?: string | null;
  color?: string | null;
};

export type MentionListRef = {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean;
};

const MentionList = forwardRef<
  MentionListRef,
  {
    items: MentionUser[];
    command: (item: MentionUser) => void;
  }
>(function MentionList({ items, command }, ref) {
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    setSelected(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelected((i) => (i + items.length - 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelected((i) => (i + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === "Enter") {
        const item = items[selected];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="z-[100] w-64 rounded-xl border border-border bg-popover p-3 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10">
        <span className="text-muted-foreground">No person or team matches</span>
      </div>
    );
  }

  return (
    <div className="z-[100] w-64 overflow-hidden rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl ring-1 ring-foreground/10">
      <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        People and Teams with access
      </p>
      <div className="max-h-60 overflow-y-auto">
        {items.map((item, index) => {
          const active = index === selected;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => command(item)}
              onMouseEnter={() => setSelected(index)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-popover-foreground transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted hover:text-foreground",
              )}
            >
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                style={item.kind === "team" ? solidChipStyle(item.color ?? "#007582") : undefined}
              >
                {item.kind === "team" ? (
                  <UsersRound className="size-4" />
                ) : (
                  item.displayName
                    .split(/\s+/)
                    .map((p) => p[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-inherit">{item.displayName}</span>
                {item.kind === "team" && item.alias && (
                  <span className="block truncate text-[11px] text-muted-foreground">@{item.alias}</span>
                )}
              </span>
              <AtSign
                className={cn(
                  "size-3.5 shrink-0",
                  active ? "text-accent-foreground/70" : "text-muted-foreground",
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
});

function buildMentionSuggestion(
  users: MentionUser[],
): Omit<SuggestionOptions<MentionUser, MentionUser>, "editor"> {
  return {
    pluginKey: mentionPluginKey,
    char: "@",
    allowSpaces: false,
    allowedPrefixes: null,
    items: ({ query }) => {
      const q = query.toLowerCase().trim();
      const list = !q
        ? users
        : users.filter(
            (u) =>
              u.displayName.toLowerCase().includes(q) ||
              (u.alias?.toLowerCase().includes(q) ?? false),
          );
      return list.slice(0, 10);
    },
    command: ({ editor, range, props: user }) => {
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          {
            type: "mention",
            attrs: {
              id: user.kind === "team" ? `team:${user.id}` : user.id,
              label: user.displayName,
            },
          },
          { type: "text", text: " " },
        ])
        .run();
    },
    render: () => {
      let component: ReactRenderer<MentionListRef> | null = null;
      let unmount: (() => void) | null = null;

      return {
        onStart: (props) => {
          component = new ReactRenderer(MentionList, {
            props: {
              items: props.items,
              command: (item: MentionUser) => {
                props.command(item);
              },
            },
            editor: props.editor,
          });
          component.element.style.zIndex = "200";
          unmount = props.mount(component.element);
        },
        onUpdate: (props) => {
          component?.updateProps({
            items: props.items,
            command: (item: MentionUser) => {
              props.command(item);
            },
          });
        },
        onKeyDown: (props) => {
          if (props.event.key === "Escape") {
            return true;
          }
          return (
            component?.ref?.onKeyDown({
              event: props.event as KeyboardEvent,
            }) ?? false
          );
        },
        onExit: () => {
          unmount?.();
          unmount = null;
          component?.destroy();
          component = null;
        },
      };
    },
  };
}

/** TipTap Mention extension configured for a fixed list of mentionable users. */
export function createMentionExtension(users: MentionUser[]) {
  return Mention.configure({
    HTMLAttributes: {
      class:
        "mention rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary not-prose",
    },
    deleteTriggerWithBackspace: true,
    renderText({ node }) {
      return `@${node.attrs.label ?? node.attrs.id ?? ""}`;
    },
    renderHTML({ node, options }) {
      return [
        "span",
        {
          ...options.HTMLAttributes,
          "data-type": "mention",
          "data-id": node.attrs.id,
          "data-label": node.attrs.label,
        },
        `@${node.attrs.label ?? node.attrs.id ?? ""}`,
      ];
    },
    // Mention's suggestion generics default to MentionNodeAttrs for the
    // selected item; we pass full user objects and map them in `command`.
    suggestion: buildMentionSuggestion(users) as never,
  });
}

/** Walk a TipTap JSON doc and collect unique mention user ids. */
export function extractMentionIds(doc: unknown): string[] {
  return extractMentionRefs(doc).userIds;
}

/** Walk a TipTap JSON doc and separate concrete people from reusable Teams. */
export function extractMentionRefs(doc: unknown): { userIds: string[]; groupIds: string[] } {
  const ids = new Set<string>();
  const groupIds = new Set<string>();
  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as {
      type?: string;
      attrs?: { id?: string };
      content?: unknown[];
    };
    if (n.type === "mention" && n.attrs?.id) {
      const id = String(n.attrs.id);
      if (id.startsWith("team:")) groupIds.add(id.slice(5));
      else ids.add(id);
    }
    if (Array.isArray(n.content)) n.content.forEach(walk);
  }
  walk(doc);
  return { userIds: [...ids], groupIds: [...groupIds] };
}
