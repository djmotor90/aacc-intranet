"use client";

/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 */
import type { JSONContent } from "@tiptap/react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { linkifyJsonContent } from "@/lib/linkify";
import { ensureContrast, onColorText } from "@/lib/color-contrast";
import { cn } from "@/lib/utils";
import { isImageAttachmentMeta, storedToDoc, type StoredRichDoc } from "./doc-utils";
import { ImageLightbox, type ImageLightboxTarget } from "./image-lightbox";

type Mark = { type: string; attrs?: Record<string, unknown> };

function formatSize(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function applyMarks(text: string, marks: Mark[] | undefined, key: string): ReactNode {
  let node: ReactNode = text;
  if (!marks?.length) return <span key={key}>{node}</span>;

  // Apply marks outer→inner so links wrap styled text.
  const ordered = [...marks].reverse();
  for (const mark of ordered) {
    switch (mark.type) {
      case "bold":
        node = <strong key={`${key}-b`}>{node}</strong>;
        break;
      case "italic":
        node = <em key={`${key}-i`}>{node}</em>;
        break;
      case "underline":
        node = <u key={`${key}-u`}>{node}</u>;
        break;
      case "strike":
        node = <s key={`${key}-s`}>{node}</s>;
        break;
      case "code":
        node = (
          <code
            key={`${key}-c`}
            className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em]"
          >
            {node}
          </code>
        );
        break;
      case "link": {
        const href = String(mark.attrs?.href ?? "#");
        node = (
          <a
            key={`${key}-a`}
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-primary underline decoration-primary/40 underline-offset-2 break-all"
          >
            {node}
          </a>
        );
        break;
      }
      case "highlight": {
        const color = mark.attrs?.color ? String(mark.attrs.color) : undefined;
        node = (
          <mark
            key={`${key}-h`}
            className="rounded-sm px-0.5"
            style={color ? { backgroundColor: color, color: onColorText(color) } : undefined}
          >
            {node}
          </mark>
        );
        break;
      }
      case "textStyle": {
        const color = mark.attrs?.color ? String(mark.attrs.color) : undefined;
        node = (
          <span key={`${key}-ts`} style={color ? { color: ensureContrast(color, "#ffffff") } : undefined}>
            {node}
          </span>
        );
        break;
      }
      case "badge": {
        const variant = String(mark.attrs?.variant ?? "grey");
        node = (
          <span
            key={`${key}-badge`}
            className={`aitim-badge aitim-badge--${variant}`}
            data-badge={variant}
          >
            {node}
          </span>
        );
        break;
      }
      default:
        break;
    }
  }
  return <span key={key}>{node}</span>;
}

type RenderCtx = {
  onOpenImage: (src: string, alt: string) => void;
};

function PreviewableImage({
  src,
  alt,
  width,
  height,
  extraClassName,
  onOpen,
}: {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  extraClassName?: string;
  onOpen: (src: string, alt: string) => void;
}) {
  return (
    <button
      type="button"
      className="block max-w-full cursor-zoom-in rounded-lg border-0 bg-transparent p-0 text-left"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpen(src, alt);
      }}
      aria-label={`Open image: ${alt}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        title={alt}
        width={width && Number.isFinite(width) ? width : undefined}
        height={height && Number.isFinite(height) ? height : undefined}
        className={cn("aitim-editor-image", extraClassName)}
        loading="lazy"
        decoding="async"
      />
    </button>
  );
}

function renderChildren(
  nodes: JSONContent[] | undefined,
  keyPrefix: string,
  ctx: RenderCtx,
): ReactNode[] {
  if (!nodes?.length) return [];
  return nodes.map((n, i) => renderNode(n, `${keyPrefix}-${i}`, ctx));
}

function renderNode(node: JSONContent, key: string, ctx: RenderCtx): ReactNode {
  switch (node.type) {
    case "doc":
      return (
        <div key={key} className="aitim-rich-doc">
          {renderChildren(node.content, key, ctx)}
        </div>
      );

    case "paragraph":
      return (
        <p key={key} className="my-1 leading-relaxed">
          {node.content?.length ? renderChildren(node.content, key, ctx) : <br />}
        </p>
      );

    case "heading": {
      const level = Math.min(4, Math.max(1, Number(node.attrs?.level ?? 1))) as 1 | 2 | 3 | 4;
      const Tag = `h${level}` as const;
      const sizes = {
        1: "text-2xl font-semibold tracking-tight my-1.5",
        2: "text-xl font-semibold tracking-tight my-1.5",
        3: "text-base font-semibold tracking-tight my-1.5",
        4: "text-sm font-semibold tracking-tight my-1.5",
      };
      return (
        <Tag key={key} className={sizes[level]}>
          {renderChildren(node.content, key, ctx)}
        </Tag>
      );
    }

    case "text":
      return applyMarks(node.text ?? "", node.marks as Mark[] | undefined, key);

    case "hardBreak":
      return <br key={key} />;

    case "image": {
      const src = String(node.attrs?.src ?? "");
      if (!src) return null;
      const alt = String(node.attrs?.alt ?? node.attrs?.title ?? "Image");
      const width = node.attrs?.width != null ? Number(node.attrs.width) : undefined;
      const height = node.attrs?.height != null ? Number(node.attrs.height) : undefined;
      return (
        <PreviewableImage
          key={key}
          src={src}
          alt={alt}
          width={width}
          height={height}
          onOpen={ctx.onOpenImage}
        />
      );
    }

    case "taskEmbed": {
      const taskNumber = String(node.attrs?.taskNumber ?? "");
      const title = String(node.attrs?.title ?? "");
      const statusName = node.attrs?.statusName
        ? String(node.attrs.statusName)
        : null;
      const statusColor = node.attrs?.statusColor
        ? String(node.attrs.statusColor)
        : null;
      const href = taskNumber
        ? `/tasks/task/${encodeURIComponent(taskNumber)}`
        : "#";
      return (
        <div key={key} className="aitim-task-embed my-2 not-prose" data-type="task-embed">
          <a
            href={href}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm shadow-sm hover:border-primary/40 hover:bg-muted/40"
          >
            <span className="font-mono text-xs font-semibold text-primary">
              {taskNumber || "Task"}
            </span>
            <span className="min-w-0 flex-1 truncate">{title || "—"}</span>
            {statusName && (
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white"
                style={{
                  backgroundColor: statusColor || "var(--muted-foreground)",
                }}
              >
                {statusName}
              </span>
            )}
          </a>
        </div>
      );
    }

    case "fileAttachment": {
      const href = String(node.attrs?.href ?? "#");
      const name = String(node.attrs?.fileName ?? "Attachment");
      const size = formatSize(
        node.attrs?.sizeBytes != null ? Number(node.attrs.sizeBytes) : null,
      );
      if (isImageAttachmentMeta(node.attrs) && href && href !== "#") {
        return (
          <PreviewableImage
            key={key}
            src={href}
            alt={name}
            onOpen={ctx.onOpenImage}
          />
        );
      }
      return (
        <div key={key} className="aitim-file-attachment" data-type="file-attachment">
          <a
            href={href}
            className="aitim-file-attachment__link"
            download={name}
            target="_blank"
            rel="noopener noreferrer"
            title={name}
          >
            <span className="aitim-file-attachment__icon" aria-hidden>
              📎
            </span>
            <span className="aitim-file-attachment__name">{name}</span>
            {size ? <span className="aitim-file-attachment__size">{size}</span> : null}
          </a>
        </div>
      );
    }

    case "mention": {
      const label = String(node.attrs?.label ?? node.attrs?.id ?? "");
      return (
        <span
          key={key}
          className="mention rounded-md bg-primary/10 px-1.5 py-0.5 font-medium text-primary not-prose"
          data-type="mention"
          data-id={String(node.attrs?.id ?? "")}
          data-label={label}
        >
          @{label}
        </span>
      );
    }

    case "bulletList":
      return (
        <ul key={key} className="my-2 list-disc pl-5">
          {renderChildren(node.content, key, ctx)}
        </ul>
      );

    case "orderedList":
      return (
        <ol key={key} className="my-2 list-decimal pl-5">
          {renderChildren(node.content, key, ctx)}
        </ol>
      );

    case "listItem":
      return <li key={key}>{renderChildren(node.content, key, ctx)}</li>;

    case "taskList":
      return (
        <ul key={key} className="my-2 list-none space-y-1 pl-0" data-type="taskList">
          {renderChildren(node.content, key, ctx)}
        </ul>
      );

    case "taskItem": {
      const checked = Boolean(node.attrs?.checked);
      return (
        <li key={key} className="flex items-start gap-2" data-checked={checked || undefined}>
          <input type="checkbox" checked={checked} readOnly className="mt-1" />
          <div className="min-w-0 flex-1">{renderChildren(node.content, key, ctx)}</div>
        </li>
      );
    }

    case "blockquote":
      return (
        <blockquote
          key={key}
          className="my-2 border-l-2 border-border pl-3 text-muted-foreground"
        >
          {renderChildren(node.content, key, ctx)}
        </blockquote>
      );

    case "codeBlock":
      return (
        <pre
          key={key}
          className="my-2 overflow-x-auto rounded-lg border border-border bg-muted/60 px-3.5 py-3 font-mono text-[13px] leading-relaxed"
        >
          <code>{renderChildren(node.content, key, ctx)}</code>
        </pre>
      );

    case "banner": {
      const variant = String(node.attrs?.variant ?? "info");
      return (
        <div
          key={key}
          data-type="banner"
          className={`aitim-banner aitim-banner--${variant} my-2`}
        >
          {renderChildren(node.content, key, ctx)}
        </div>
      );
    }

    case "pullQuote":
      return (
        <blockquote
          key={key}
          data-type="pull-quote"
          className="aitim-pull-quote my-2"
        >
          {renderChildren(node.content, key, ctx)}
        </blockquote>
      );

    case "horizontalRule":
      return <hr key={key} className="my-3 border-border" />;

    case "table":
      return (
        <div key={key} className="my-2 overflow-x-auto">
          <table className="aitim-table w-full border-collapse text-sm">
            <tbody>{renderChildren(node.content, key, ctx)}</tbody>
          </table>
        </div>
      );

    case "tableRow":
      return <tr key={key}>{renderChildren(node.content, key, ctx)}</tr>;

    case "tableHeader":
      return (
        <th
          key={key}
          className="border border-border bg-muted/50 px-2 py-1.5 text-left font-medium"
        >
          {renderChildren(node.content, key, ctx)}
        </th>
      );

    case "tableCell":
      return (
        <td key={key} className="border border-border px-2 py-1.5 align-top">
          {renderChildren(node.content, key, ctx)}
        </td>
      );

    default:
      // Unknown block/inline — still try children so content isn't lost.
      if (node.content?.length) {
        return (
          <div key={key} data-type={node.type ?? "unknown"}>
            {renderChildren(node.content, key, ctx)}
          </div>
        );
      }
      if (node.text) return applyMarks(node.text, node.marks as Mark[] | undefined, key);
      return null;
  }
}

/**
 * Read-only React renderer for TipTap JSON.
 * Prefer this over ProseMirror for comments/activity — images and files
 * always paint as real DOM (no node-view / hydration gaps).
 */
export function RichDocView({
  content,
  className,
}: {
  content: StoredRichDoc | JSONContent | string | null | undefined;
  className?: string;
}) {
  const [preview, setPreview] = useState<ImageLightboxTarget | null>(null);
  const doc = useMemo(() => {
    const raw = storedToDoc(content as StoredRichDoc);
    return linkifyJsonContent(raw) ?? raw;
  }, [content]);
  const ctx = useMemo<RenderCtx>(
    () => ({
      onOpenImage: (src, alt) => setPreview({ src, alt }),
    }),
    [],
  );

  return (
    <div
      className={cn(
        "aitim-editor aitim-rich-doc-view prose prose-sm dark:prose-invert max-w-none",
        "prose-p:my-1 prose-p:leading-relaxed",
        "prose-headings:my-1.5 prose-ul:my-1 prose-ol:my-1",
        "prose-a:text-primary prose-a:underline",
        className,
      )}
    >
      {renderNode(doc, "root", ctx)}
      <ImageLightbox image={preview} onClose={() => setPreview(null)} />
    </div>
  );
}
