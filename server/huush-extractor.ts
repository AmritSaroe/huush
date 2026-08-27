import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { lookup } from "node:dns/promises";

const MAX_HTML_CHARS = 2_500_000;
const FETCH_TIMEOUT_MS = 15_000;
const PREVIEW_MIN_CHARS = 1_200;
const PREVIEW_MIN_BLOCKS = 3;

const GATE_PHRASES = [
  "subscribe to continue",
  "subscribe now",
  "sign in to continue",
  "sign in to read",
  "already a subscriber",
  "premium content",
  "this is a premium article",
  "to continue reading",
  "unlock this article",
  "register to continue",
];

const NOISE_SELECTOR = [
  "script", "style", "noscript", "iframe", "form", "button", "input", "select", "textarea",
  "nav", "aside", "footer", "[role='navigation']", "[role='complementary']",
  ".advertisement", ".advert", ".ad", ".promo", ".newsletter", ".subscribe", ".paywall",
].join(",");

export type HuushExtraction = {
  url: string;
  title: string;
  source: string;
  byline?: string;
  excerpt: string;
  content: string[];
  previewOnly: boolean;
  accessGated: boolean;
  strategy: "readability" | "semantic-fallback";
  score: number;
};

function cleanText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function textFromMeta(document: Document, selector: string): string {
  return cleanText(document.querySelector(selector)?.getAttribute("content"));
}

function fullTitle(document: Document, readabilityTitle: string | undefined): string {
  return textFromMeta(document, "meta[property='og:title']")
    || textFromMeta(document, "meta[name='twitter:title']")
    || cleanText(document.querySelector("h1")?.textContent)
    || cleanText(readabilityTitle)
    || cleanText(document.title)
    || "Untitled article";
}

function sourceName(url: URL): string {
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const names: Record<string, string> = {
    "mybs.in": "Business Standard",
    "business-standard.com": "Business Standard",
    "livemint.com": "Live Mint",
    "thehindubusinessline.com": "BusinessLine",
    "economictimes.indiatimes.com": "Economic Times",
    "ideasforindia.in": "Ideas for India",
    "moneylife.in": "Moneylife",
  };
  return names[host] ?? url.hostname.replace(/^www\./, "");
}

function assertFetchableUrl(value: string): URL {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("Only http and https article links are supported.");
  if (url.username || url.password) throw new Error("Article links must not contain credentials.");
  return url;
}

function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase().replace(/^::ffff:/, "");
  return value === "::1" || value === "0.0.0.0" || value === "localhost"
    || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:")
    || /^127\./.test(value) || /^10\./.test(value) || /^192\.168\./.test(value) || /^169\.254\./.test(value)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(value);
}

async function assertPublicHost(url: URL): Promise<void> {
  const host = url.hostname.toLowerCase().replace(/[\[\]]/g, "");
  if (host === "localhost" || host.endsWith(".local") || isPrivateAddress(host)) throw new Error("This address cannot be fetched.");
  const resolved = await lookup(host, { all: true, verbatim: true });
  if (resolved.length === 0 || resolved.some(({ address }) => isPrivateAddress(address))) throw new Error("This address cannot be fetched.");
}

async function fetchPublicHtml(initialUrl: URL): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let url = initialUrl;
    let response: Response | null = null;
    for (let hops = 0; hops < 5; hops += 1) {
      await assertPublicHost(url);
      response = await fetch(url, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "User-Agent": "Mozilla/5.0 (compatible; Huush/1.0; public article reader)",
        },
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      if (!location) throw new Error("The publisher returned an invalid redirect.");
      url = new URL(location, url);
    }
    if (!response || [301, 302, 303, 307, 308].includes(response.status)) throw new Error("The publisher redirected too many times.");
    if (!response.ok) throw new Error(`The publisher returned HTTP ${response.status}.`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) throw new Error("This link did not return an HTML article page.");
    const html = await response.text();
    if (html.length < 500) throw new Error("The publisher returned an unexpectedly short page.");
    if (html.length > MAX_HTML_CHARS) throw new Error("The publisher returned an unexpectedly large page.");
    return html;
  } finally {
    clearTimeout(timeout);
  }
}

function blocksFromHtml(html: string, sourceUrl: string): string[] {
  const dom = new JSDOM(html, { url: sourceUrl });
  const document = dom.window.document;
  document.querySelectorAll(NOISE_SELECTOR).forEach((node: Element) => node.remove());
  document.querySelectorAll("*").forEach((node: Element) => {
    for (const attribute of Array.from(node.attributes)) {
      const name = attribute.name.toLowerCase();
      if (name === "style" || name === "class" || name === "id" || name.startsWith("data-") || name.startsWith("on")) node.removeAttribute(attribute.name);
    }
  });
  const blocks: string[] = [];
  const seen = new Set<string>();
  document.querySelectorAll("p, h2, h3, li, blockquote").forEach((node: Element) => {
    const text = cleanText(node.textContent);
    const key = text.toLowerCase();
    if (text.length < 28 || seen.has(key)) return;
    seen.add(key);
    blocks.push(text);
  });
  return blocks;
}

function semanticFallback(document: Document): string[] {
  const root = document.querySelector("article, main, [role='main']") ?? document.body;
  return Array.from(root.querySelectorAll("p, h2, h3, li, blockquote"))
    .map((node: Element) => cleanText(node.textContent))
    .filter((block, index, values) => block.length >= 28 && values.indexOf(block) === index);
}

export async function extractPublicArticle(input: string): Promise<HuushExtraction> {
  const url = assertFetchableUrl(input);
  const html = await fetchPublicHtml(url);
  const original = new JSDOM(html, { url: url.toString() });
  const parsed = new Readability(original.window.document.cloneNode(true) as Document, { charThreshold: 160 }).parse();
  const readableBlocks = parsed?.content ? blocksFromHtml(parsed.content, url.toString()) : [];
  const fallbackBlocks = semanticFallback(original.window.document);
  const content = readableBlocks.length > 0 ? readableBlocks : fallbackBlocks;
  if (content.length === 0) throw new Error("Huush could not find readable public article text on this page.");
  const pageText = cleanText(original.window.document.body.textContent).toLowerCase();
  const articleText = content.join(" ");
  const accessGated = GATE_PHRASES.some((phrase) => pageText.includes(phrase));
  const previewOnly = accessGated || articleText.length < PREVIEW_MIN_CHARS || content.length < PREVIEW_MIN_BLOCKS;
  return {
    url: url.toString(),
    title: fullTitle(original.window.document, parsed?.title ?? undefined),
    source: sourceName(url),
    byline: cleanText(parsed?.byline) || undefined,
    excerpt: cleanText(parsed?.excerpt) || articleText.slice(0, 220),
    content,
    previewOnly,
    accessGated,
    strategy: readableBlocks.length > 0 ? "readability" : "semantic-fallback",
    score: Math.min(100, Math.round((articleText.length / PREVIEW_MIN_CHARS) * 70 + Math.min(content.length, 6) * 5) - (accessGated ? 35 : 0)),
  };
}
