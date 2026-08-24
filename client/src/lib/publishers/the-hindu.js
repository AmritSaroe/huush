import { cleanText, fixByline, fixTitle, getHeroImageUrl, heroImage, stripImageByIdentity } from "../extractor/metadata.js";
import { sanitizeHtml, textFromHtml } from "../extractor/sanitize.js";

const THE_HINDU_HOSTS = new Set(["thehindu.com"]);

function hostWithoutPrefix(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return "";
  }
}

export function isTheHinduUrl(url) {
  return THE_HINDU_HOSTS.has(hostWithoutPrefix(url));
}

function hinduByline(doc) {
  return cleanText(
    doc?.querySelector('meta[property="article:author"]')?.content
      || doc?.querySelector('meta[name="twitter:creator"]')?.content
      || "",
  ) || fixByline(doc, "");
}

function removePublisherChrome(root) {
  const clone = root.cloneNode(true);
  clone.querySelectorAll([
    "script",
    "style",
    "noscript",
    "nav",
    "header",
    "footer",
    "aside",
    "form",
    "button",
    ".print-hide",
    ".article-ad",
    ".comments-shares",
    ".comments",
    ".share-page",
    ".related-topics",
    ".spliter",
    ".d-none",
    ".d-sm-none",
    ".d-lg-block",
    ".d-xl-block",
    "[class*='ad-']",
    "[class*='-ad']",
    "[class*='share']",
    "[class*='comment']",
    "[class*='related']",
    "[class*='publish']",
  ].join(",")).forEach((node) => node.remove());
  return clone;
}

function contentCandidates(doc) {
  const roots = [
    doc.querySelector("div.articlebodycontent .articleblock-container"),
    doc.querySelector("div.articlebodycontent div[itemprop='articleBody']"),
    doc.querySelector("div.articlebodycontent"),
    doc.querySelector("div.article-body"),
    doc.querySelector("[itemprop='articleBody']"),
  ].filter(Boolean);
  const seen = new Set();
  return roots
    .filter((root) => {
      if (seen.has(root)) return false;
      seen.add(root);
      return true;
    })
    .map((root) => removePublisherChrome(root))
    .filter((root) => textFromHtml(root.innerHTML).length >= 100)
    .sort((left, right) => textFromHtml(right.innerHTML).length - textFromHtml(left.innerHTML).length);
}

function removeStoryLabel(paragraph) {
  const labelPattern = /^\s*the story so far:\s*/i;
  if (!labelPattern.test(paragraph.textContent || "")) return false;
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  let labelRemoved = false;
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);
  for (const textNode of textNodes) {
    if (labelRemoved) break;
    const updated = textNode.nodeValue.replace(labelPattern, "");
    if (updated !== textNode.nodeValue) {
      textNode.nodeValue = updated;
      labelRemoved = true;
    }
  }
  paragraph.querySelectorAll("b, strong").forEach((element) => {
    if (!element.textContent.trim()) element.remove();
  });
  return labelRemoved;
}

function normalizeStorySoFar(root) {
  const firstParagraph = root.querySelector("p");
  if (!firstParagraph || !/^\s*the story so far:/i.test(firstParagraph.textContent || "")) return;
  removeStoryLabel(firstParagraph);
  const group = document.createElement("div");
  group.setAttribute("role", "group");
  const heading = document.createElement("h2");
  heading.textContent = "Story So Far";
  firstParagraph.parentNode.insertBefore(group, firstParagraph);
  group.append(heading, firstParagraph);
}

export function extractCandidates(doc, url) {
  const root = contentCandidates(doc)[0];
  if (!root) return [];
  normalizeStorySoFar(root);
  const title = fixTitle(doc, "");
  const byline = hinduByline(doc);
  const content = sanitizeHtml(root.innerHTML, url);
  const textContent = textFromHtml(content);
  if (!content || textContent.length < 100) return [];
  const heroUrl = getHeroImageUrl(doc, url);
  return [{
    title,
    byline,
    content: `${heroImage(doc, url, title)}${stripImageByIdentity(content, heroUrl, url)}`,
    textContent,
    excerpt: textContent.slice(0, 240),
    _publisherSpecific: true,
    _strategy: "the-hindu-structured",
  }];
}

export const theHinduAdapter = {
  id: "the-hindu",
  matches: isTheHinduUrl,
  extractCandidates,
};

