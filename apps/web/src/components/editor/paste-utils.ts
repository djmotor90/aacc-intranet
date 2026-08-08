/**
 * Proprietary — Copyright (c) 2024–2026 Kim Gurinov (Gurver).
 * Author: Kim Gurinov <kurinov@gurver.org> <kim@gurver.com>
 * Website: https://gurver.com
 * Fingerprint: GURVER-KG-AITIM-2026-7F3C9E2A
 * License: Proprietary. All rights reserved. See LICENSE / COPYRIGHT.
 *
 * Clipboard helpers for smarter Word / browser paste into TipTap.
 */

/** True when pasted HTML has real structure (not an empty Word wrapper). */
export function htmlHasSubstantialContent(html: string): boolean {
  if (!html || html.length < 8) return false;
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Ignore pure whitespace / single bullet from empty Word selection
  return text.length >= 2;
}

/**
 * Clean Word / Office / Google Docs HTML for TipTap.
 * Keeps semantic structure (p, headings, lists, tables, links, images, bold/italic)
 * while stripping MSO junk and most inline styles.
 */
export function sanitizePastedHtml(html: string): string {
  return sanitizePastedHtmlDetailed(html).html;
}

/**
 * Same cleanup as {@link sanitizePastedHtml}, but also reports how many
 * `<img>` tags were dropped because their src pointed at a local resource
 * the browser can't read (Word/Outlook on Windows commonly emit
 * `src="file:///C:\...\clip_image001.png"` for embedded images — that path
 * only exists on the sender's machine, never in the clipboard payload we get).
 */
export function sanitizePastedHtmlDetailed(html: string): {
  html: string;
  droppedImages: number;
} {
  let out = html;
  let droppedImages = 0;

  // Drop Office conditional comments and XML namespaces
  out = out.replace(/<!--\[if[\s\S]*?<!\[endif\]-->/gi, "");
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<\/?o:p[^>]*>/gi, "");
  out = out.replace(/<\/?w:[^>]*>/gi, "");
  out = out.replace(/<\/?m:[^>]*>/gi, "");
  out = out.replace(/<\/?v:[^>]*>/gi, "");

  // Styles / scripts
  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<meta[^>]*>/gi, "");
  out = out.replace(/<link[^>]*>/gi, "");
  out = out.replace(/<xml[\s\S]*?<\/xml>/gi, "");

  // Convert common Word heading styles before stripping classes
  out = out.replace(
    /<p[^>]*class="[^"]*MsoHeading\s*1[^"]*"[^>]*>([\s\S]*?)<\/p>/gi,
    "<h1>$1</h1>",
  );
  out = out.replace(
    /<p[^>]*class="[^"]*MsoHeading\s*2[^"]*"[^>]*>([\s\S]*?)<\/p>/gi,
    "<h2>$1</h2>",
  );
  out = out.replace(
    /<p[^>]*class="[^"]*MsoHeading\s*3[^"]*"[^>]*>([\s\S]*?)<\/p>/gi,
    "<h3>$1</h3>",
  );
  out = out.replace(
    /<p[^>]*class="[^"]*MsoListParagraph[^"]*"[^>]*>([\s\S]*?)<\/p>/gi,
    "<p>$1</p>",
  );

  // Google Docs / LibreOffice often use <b> / <i>
  out = out.replace(/<\/?b\b[^>]*>/gi, (m) => (m.startsWith("</") ? "</strong>" : "<strong>"));
  out = out.replace(/<\/?i\b[^>]*>/gi, (m) => (m.startsWith("</") ? "</em>" : "<em>"));

  // Drop class/id/lang (except keep none — TipTap doesn't need them)
  out = out.replace(/\sclass="[^"]*"/gi, "");
  out = out.replace(/\sid="[^"]*"/gi, "");
  out = out.replace(/\slang="[^"]*"/gi, "");
  out = out.replace(/\sdir="[^"]*"/gi, "");

  // Strip most styles; keep minimal useful ones on images (width) later via attrs
  out = out.replace(/\sstyle="[^"]*"/gi, "");

  // Remove empty spans / fonts
  out = out.replace(/<\/?font\b[^>]*>/gi, "");
  out = out.replace(/<span\b[^>]*>\s*<\/span>/gi, "");
  // Unwrap remaining spans
  out = out.replace(/<span\b[^>]*>/gi, "");
  out = out.replace(/<\/span>/gi, "");

  // Drop broken / local-only image sources we can't load
  out = out.replace(
    /<img\b[^>]*\bsrc=["'](?:file:|cid:|webkit-fake-url:)[^"']*["'][^>]*\/?>/gi,
    () => {
      droppedImages += 1;
      return "";
    },
  );
  // Drop images with empty src
  out = out.replace(/<img\b[^>]*\bsrc=["']\s*["'][^>]*\/?>/gi, () => {
    droppedImages += 1;
    return "";
  });

  // Collapse excessive empty paragraphs
  out = out.replace(/(<p>\s*<\/p>\s*){3,}/gi, "<p></p>");

  return { html: out.trim(), droppedImages };
}

export type ExtractedDataImage = {
  /** Unique marker left in HTML as img src */
  marker: string;
  dataUrl: string;
  mime: string;
};

/**
 * Pull data:image… URLs out of HTML and replace with temporary markers
 * so we can upload them and swap in permanent attachment URLs.
 */
export function extractDataUrlImages(html: string): {
  html: string;
  images: ExtractedDataImage[];
} {
  const images: ExtractedDataImage[] = [];
  let i = 0;
  const nextHtml = html.replace(
    /(<img\b[^>]*\bsrc=["'])(data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+)(["'][^>]*>)/gi,
    (_full, pre: string, dataUrl: string, post: string) => {
      const mimeMatch = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/i.exec(dataUrl);
      const mime = mimeMatch?.[1] ?? "image/png";
      const marker = `aitim-paste-img://${i++}`;
      images.push({ marker, dataUrl, mime });
      return `${pre}${marker}${post}`;
    },
  );
  return { html: nextHtml, images };
}

export function dataUrlToFile(dataUrl: string, mime: string, index: number): File | null {
  try {
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return null;
    const b64 = dataUrl.slice(comma + 1);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "png";
    return new File([bytes], `pasted-image-${index + 1}.${ext}`, { type: mime });
  } catch {
    return null;
  }
}

/** Lightweight SVG placeholder when we can't preview a blob yet (failed parse). */
export function uploadingPlaceholderDataUrl(label = "Uploading…"): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#e8eef2"/>
  <rect x="24" y="24" width="592" height="312" rx="16" fill="#f7fafc" stroke="#c5d0d8" stroke-width="2" stroke-dasharray="10 8"/>
  <text x="320" y="185" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" fill="#5b6b76">${label}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Decide how to handle a paste event.
 * - files-only: screenshot / single image (no real HTML body)
 * - html-with-assets: Word/docs HTML that may include data-URLs and/or files
 * - default: let TipTap handle (plain text / simple HTML)
 */
export function classifyPasteWithFiles(
  data: DataTransfer | null | undefined,
  files: File[],
): {
  mode: "files-only" | "html-with-assets" | "default";
  html: string;
  plain: string;
  files: File[];
  sanitizedHtml: string;
  dataImages: ExtractedDataImage[];
  /**
   * `<img>` tags removed because their src was a local-only reference
   * (`file:`/`cid:`/`webkit-fake-url:` or empty) — most commonly Word/Outlook
   * on Windows pointing at an image that only exists on the sender's disk.
   * These are unrecoverable unless a matching blob shows up in `files`.
   */
  droppedImageCount: number;
} {
  const html = data?.getData("text/html")?.trim() ?? "";
  const plain = data?.getData("text/plain")?.trim() ?? "";
  const substantial = htmlHasSubstantialContent(html);
  const { html: cleaned, droppedImages: droppedImageCount } = substantial
    ? sanitizePastedHtmlDetailed(html)
    : { html: "", droppedImages: 0 };
  const { html: withMarkers, images: dataImages } = substantial
    ? extractDataUrlImages(cleaned)
    : { html: cleaned, images: [] as ExtractedDataImage[] };

  // Temporary diagnostics: sanitizePastedHtmlDetailed only counts <img> tags
  // it can see *after* the MSO conditional-comment and VML strips run, so it
  // can under-count (e.g. <v:imagedata src="file:...">, or an <img> that a
  // non-greedy conditional-comment match happened to swallow). Compare the
  // raw payload so a mismatch is visible instead of silently misdiagnosed.
  if (typeof window !== "undefined" && html) {
    const rawImgTags = html.match(/<img\b/gi)?.length ?? 0;
    const rawFileSrcs = html.match(/\bsrc=["']file:/gi)?.length ?? 0;
    const rawVmlImagedata = html.match(/<v:imagedata\b/gi)?.length ?? 0;
    if (rawImgTags > 0 || rawFileSrcs > 0 || rawVmlImagedata > 0) {
      console.warn("[paste] diagnostics", {
        clipboardTypes: data ? Array.from(data.types) : [],
        rawImgTags,
        rawFileSrcs,
        rawVmlImagedata,
        droppedImageCount,
        dataImageCount: dataImages.length,
        clipboardFileCount: files.length,
        clipboardFileTypes: files.map((f) => f.type),
      });
    }
  }

  if (files.length > 0 && !substantial && dataImages.length === 0) {
    return {
      mode: "files-only",
      html,
      plain,
      files,
      sanitizedHtml: "",
      dataImages: [],
      droppedImageCount,
    };
  }

  if (substantial || dataImages.length > 0) {
    return {
      mode: "html-with-assets",
      html,
      plain,
      files,
      sanitizedHtml: withMarkers,
      dataImages,
      droppedImageCount,
    };
  }

  return {
    mode: "default",
    html,
    plain,
    files,
    sanitizedHtml: "",
    dataImages: [],
    droppedImageCount,
  };
}
