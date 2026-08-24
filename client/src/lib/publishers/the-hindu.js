import { cleanText, fixByline, fixTitle, getHeroImageUrl, heroImage, stripImageByIdentity } from "../extractor/metadata.js";
import { escapeHtml, sanitizeHtml, textFromHtml } from "../extractor/sanitize.js";
import { fetchHtml } from "../extractor/transport.js";

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

function ampUrl(url) {
  const parsed = new URL(url);
  if (!/\/amp\/?$/i.test(parsed.pathname)) parsed.pathname = `${parsed.pathname.replace(/\/+$/, "")}/amp/`;
  return parsed.href;
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
    ".also-read",
    ".paywallblock",
    ".piano-modal-paywallblock",
    ".height292",
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
  clone.querySelectorAll("div").forEach((node) => {
    const text = cleanText(node.textContent || "");
    if (/^advertisement(?:\s+advertisement)?$/i.test(text) && !node.querySelector("img")) node.remove();
  });
  return clone;
}

function contentRoot(doc) {
  return [
    doc.querySelector("div.articlebodycontent div[itemprop='articleBody']"),
    doc.querySelector("div.articlebodycontent .schemaDiv"),
    doc.querySelector("div.articlebodycontent"),
    doc.querySelector("div.article-body"),
    doc.querySelector("[itemprop='articleBody']"),
  ].find(Boolean) || null;
}

function prependLead(root, doc) {
  const lead = doc.querySelector("h2.sub-title, h2.sub_title, .storyline > h2");
  const text = cleanText(lead?.textContent || "");
  if (!text || root.textContent.includes(text)) return;
  const heading = document.createElement("h2");
  heading.textContent = text;
  root.insertBefore(heading, root.firstChild);
}

function normalizeStorySoFar(root) {
  const firstParagraph = root.querySelector("p");
  if (!firstParagraph || !/^\s*the story so far:/i.test(firstParagraph.textContent || "")) return;
  const walker = document.createTreeWalker(firstParagraph, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);
  let labelRemoved = false;
  for (const textNode of textNodes) {
    if (labelRemoved) break;
    const updated = textNode.nodeValue.replace(/^\s*the story so far:\s*/i, "");
    if (updated !== textNode.nodeValue) {
      textNode.nodeValue = updated;
      labelRemoved = true;
    }
  }
  firstParagraph.querySelectorAll("b, strong").forEach((element) => {
    if (!element.textContent.trim()) element.remove();
  });
  const group = document.createElement("div");
  group.setAttribute("role", "group");
  const heading = document.createElement("h2");
  heading.textContent = "Story So Far";
  firstParagraph.parentNode.insertBefore(group, firstParagraph);
  group.append(heading, firstParagraph);
}

function extractFromDocument(doc, url, strategy) {
  const originalRoot = contentRoot(doc);
  if (!originalRoot) return null;
  const root = removePublisherChrome(originalRoot);
  prependLead(root, doc);
  normalizeStorySoFar(root);
  const title = fixTitle(doc, "");
  const byline = hinduByline(doc);
  const content = sanitizeHtml(root.innerHTML, url);
  const textContent = textFromHtml(content);
  if (!content || textContent.length < 100) return null;
  const heroUrl = getHeroImageUrl(doc, url);
  return {
    title,
    byline,
    content: `${heroImage(doc, url, title)}${stripImageByIdentity(content, heroUrl, url)}`,
    textContent,
    excerpt: textContent.slice(0, 240),
    _publisherSpecific: true,
    _strategy: strategy,
  };
}

export function extractCandidates(doc, url) {
  const candidate = extractFromDocument(doc, url, "the-hindu-structured");
  return candidate ? [candidate] : [];
}

export async function extractAmpCandidate(url, options = {}) {
  const alternateUrl = ampUrl(url);
  try {
    options.log?.("fetch.the-hindu.amp.started", "Trying The Hindu’s public AMP article representation");
    const html = await fetchHtml(alternateUrl, options);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const candidate = extractFromDocument(doc, alternateUrl, "the-hindu-amp-structured");
    if (!candidate) throw new Error("No structured AMP article body");
    options.log?.("fetch.the-hindu.amp.succeeded", `${candidate.textContent.length} characters from public AMP body`);
    return candidate;
  } catch (error) {
    options.log?.("fetch.the-hindu.amp.failed", error instanceof Error ? error.message : "AMP extraction failed");
    return null;
  }
}

export const theHinduAdapter = {
  id: "the-hindu",
  matches: isTheHinduUrl,
  extractCandidates,
  async extractCandidatesAsync(doc, url, options = {}) {
    const candidate = await extractAmpCandidate(url, options);
    return candidate ? [candidate] : [];
  },
};
