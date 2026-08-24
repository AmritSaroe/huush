import { sanitizeContent as sanitizeStoredContent } from "../article-sanitizer.js";

export function sanitizeHtml(html = "", baseUrl = "") {
  return sanitizeStoredContent(html, baseUrl);
}

export function textFromHtml(html = "") {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  return String(doc.body?.textContent || "").replace(/\s+/g, " ").trim();
}

export function blockCount(html = "") {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  return doc.querySelectorAll("p, h2, h3, h4, h5, h6, li, blockquote").length;
}

export function htmlFromPlainText(text = "") {
  return String(text || "")
    .split(/\r?\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
