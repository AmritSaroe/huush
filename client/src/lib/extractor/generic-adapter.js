import { Readability } from "@mozilla/readability";
import { fixByline, fixTitle, heroImage, cleanText } from "./metadata.js";
import { escapeHtml, sanitizeHtml, textFromHtml } from "./sanitize.js";
import { PAYWALL_PHRASES } from "./paywall.js";

function fromReadability(doc, url) {
  const parsed = new Readability(doc.cloneNode(true), { charThreshold: 20 }).parse();
  if (!parsed) return null;
  const title = fixTitle(doc, parsed.title);
  const byline = fixByline(doc, parsed.byline);
  const content = sanitizeHtml(parsed.content, url);
  const textContent = textFromHtml(content);
  if (!textContent || textContent.length < 100) return null;
  return {
    title,
    byline,
    content: `${heroImage(doc, url, title, content)}${content}`,
    textContent,
    excerpt: textContent.slice(0, 240),
  };
}

function fromParagraphs(doc, url, existingTitle = "", existingByline = "") {
  const title = existingTitle || fixTitle(doc, "");
  const byline = existingByline || fixByline(doc, "");
  const selectors = [
    "article",
    "[itemprop='articleBody']",
    ".article-content",
    ".story-content",
    ".main-content",
    ".content",
    "#article-body",
    ".entry-content",
    ".post-content",
  ];
  let root = null;
  for (const selector of selectors) {
    root = doc.querySelector(selector);
    if (root) break;
  }
  if (!root) root = doc.body;

  const paragraphs = [];
  const seen = new Set();
  for (const paragraph of root.querySelectorAll("p")) {
    if (paragraph.closest("nav, header, footer, aside, form, [role='navigation']")) continue;
    const text = cleanText(paragraph.textContent || "");
    if (!text || text.length < 40 || seen.has(text)) continue;
    const lower = text.toLowerCase();
    if (PAYWALL_PHRASES.some((phrase) => lower.includes(phrase))) continue;
    if (/^(related|also read|trending|recommended|advertisement|copyright|disclaimer)/i.test(text)) continue;
    seen.add(text);
    paragraphs.push(text);
  }
  if (paragraphs.length < 2) return null;
  const html = paragraphs.map((text) => `<p>${escapeHtml(text)}</p>`).join("");
  const textContent = paragraphs.join(" ");
  return {
    title,
    byline,
    content: `${heroImage(doc, url, title, html)}${html}`,
    textContent,
    excerpt: textContent.slice(0, 240),
  };
}

export function extractCandidates(doc, url) {
  const readability = fromReadability(doc, url);
  const deep = fromParagraphs(doc, url, readability?.title || "", readability?.byline || "");
  return [
    readability ? { ...readability, _strategy: "readability" } : null,
    deep ? { ...deep, _strategy: "deep" } : null,
  ].filter(Boolean);
}

export const genericAdapter = {
  id: "generic",
  matches: () => true,
  extractCandidates,
};
