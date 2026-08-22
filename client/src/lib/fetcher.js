import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";

export const ARTICLE_STORAGE_KEY = "whitemint:articles";
export const SHORT_ARTICLE_LIMITS = Object.freeze({
  minParagraphs: 3,
  minCharacters: 1200,
});

const DEFAULT_TIMEOUT_MS = 30_000;

const SOURCE_DOMAIN_NAMES = Object.freeze({
  "mybs.in": "Business Standard",
  "business-standard.com": "Business Standard",
  "thehindu.com": "The Hindu",
  "indianexpress.com": "The Indian Express",
  "hindustantimes.com": "Hindustan Times",
  "indiatoday.in": "India Today",
  "ndtv.com": "NDTV",
  "timesofindia.indiatimes.com": "The Times of India",
  "reuters.com": "Reuters",
  "bbc.com": "BBC",
  "bbc.co.uk": "BBC",
  "theguardian.com": "The Guardian",
  "nytimes.com": "The New York Times",
  "washingtonpost.com": "The Washington Post",
  "wsj.com": "The Wall Street Journal",
  "ft.com": "Financial Times",
  "economist.com": "The Economist",
  "medium.com": "Medium",
  "substack.com": "Substack",
});

const PURIFY_CONFIG = Object.freeze({
  USE_PROFILES: { html: true },
  ALLOW_DATA_ATTR: false,
  ADD_TAGS: ["figure", "figcaption", "picture", "source"],
  ADD_ATTR: [
    "src",
    "alt",
    "title",
    "width",
    "height",
    "loading",
    "decoding",
    "srcset",
    "sizes",
  ],
  FORBID_TAGS: [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "form",
    "input",
    "button",
    "textarea",
    "select",
    "option",
    "svg",
    "meta",
    "link",
    "base",
    "noscript",
  ],
  FORBID_ATTR: ["style", "class", "id", "srcdoc"],
});

function normalizeWhitespace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function textContentFromHtml(html = "") {
  const shell = document.createElement("div");
  shell.innerHTML = html;
  return normalizeWhitespace(shell.textContent || shell.innerText || "");
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resolveHttpUrl(candidate, baseUrl) {
  if (!candidate) return "";
  try {
    const resolved = new URL(String(candidate).trim(), baseUrl || undefined);
    if (!/^https?:$/.test(resolved.protocol)) return "";
    if (resolved.protocol === "http:" && /^https:/i.test(baseUrl || ""))
      resolved.protocol = "https:";
    return resolved.href;
  } catch {
    return "";
  }
}

function bestSrcsetCandidate(value = "") {
  return (
    value
      .split(",")
      .map(entry => entry.trim().split(/\s+/))
      .filter(([url]) => Boolean(url))
      .map(([url, descriptor = "1x"]) => ({
        url,
        score: Number.parseFloat(descriptor) || 1,
      }))
      .sort((a, b) => b.score - a.score)[0]?.url || ""
  );
}

function imageCandidate(image, baseUrl) {
  const candidates = [
    image.getAttribute("data-src"),
    image.getAttribute("data-original"),
    image.getAttribute("data-lazy-src"),
    image.getAttribute("data-image"),
    bestSrcsetCandidate(image.getAttribute("data-srcset") || ""),
    bestSrcsetCandidate(image.getAttribute("srcset") || ""),
    image.getAttribute("src"),
  ];
  return (
    candidates
      .map(candidate => resolveHttpUrl(candidate || "", baseUrl))
      .find(Boolean) || ""
  );
}

function normalizeArticleImages(root, baseUrl, heroFallback = "") {
  root.querySelectorAll("img").forEach(image => {
    const candidate = imageCandidate(image, baseUrl);
    if (!candidate) {
      image.remove();
      return;
    }
    image.setAttribute("src", candidate);
    image.setAttribute("loading", image.closest("figure") ? "eager" : "lazy");
    image.setAttribute("decoding", "async");
    [
      "srcset",
      "data-srcset",
      "sizes",
      "data-src",
      "data-original",
      "data-lazy-src",
      "data-image",
    ].forEach(attribute => image.removeAttribute(attribute));
  });
  if (!root.querySelector("img") && heroFallback)
    root.insertAdjacentHTML("afterbegin", heroFallback);
}

function removeUnsafeNodes(root) {
  root
    .querySelectorAll(
      "script, style, iframe, object, embed, form, input, button, textarea, select, option, svg, meta, link, base, noscript"
    )
    .forEach(node => node.remove());
}

function stripPresentationAttributes(root) {
  root.querySelectorAll("*").forEach(element => {
    Array.from(element.attributes).forEach(attribute => {
      const name = attribute.name.toLowerCase();
      if (
        name === "style" ||
        name === "class" ||
        name === "id" ||
        name.startsWith("data-") ||
        name.startsWith("on") ||
        name === "srcdoc"
      ) {
        element.removeAttribute(attribute.name);
      }
    });
  });
}

/**
 * Remove publisher styling and executable content from extracted article HTML.
 * Image lazy-loading attributes are normalized before all data-* attributes are removed.
 */
export function sanitizeContent(
  html = "",
  { baseUrl = "", heroFallback = "" } = {}
) {
  const container = document.createElement("div");
  container.innerHTML = String(html || "");
  removeUnsafeNodes(container);
  normalizeArticleImages(container, baseUrl, heroFallback);
  removeUnsafeNodes(container);
  stripPresentationAttributes(container);

  const purified = DOMPurify.sanitize(container.innerHTML, PURIFY_CONFIG);
  const cleanContainer = document.createElement("div");
  cleanContainer.innerHTML = purified;
  removeUnsafeNodes(cleanContainer);
  stripPresentationAttributes(cleanContainer);
  return cleanContainer.innerHTML;
}

function metaContent(doc, selectors) {
  for (const selector of selectors) {
    const content = normalizeWhitespace(
      doc.querySelector(selector)?.getAttribute("content") || ""
    );
    if (content) return content;
  }
  return "";
}

/**
 * Prefer publisher-provided titles over Readability's title guess.
 * The h1 fallback deliberately uses textContent so split spans/elements are joined.
 */
export function getTitleWithFallbacks(doc, readabilityTitle = "") {
  const ogTitle = metaContent(doc, [
    "meta[property='og:title']",
    "meta[name='og:title']",
  ]);
  if (ogTitle) return ogTitle;

  const twitterTitle = metaContent(doc, [
    "meta[name='twitter:title']",
    "meta[property='twitter:title']",
  ]);
  if (twitterTitle) return twitterTitle;

  const headingTitle = normalizeWhitespace(
    doc.querySelector("h1")?.textContent || ""
  );
  if (headingTitle) return headingTitle;

  const guessedTitle = normalizeWhitespace(readabilityTitle);
  return guessedTitle || "Untitled article";
}

function openGraphHeroImage(doc, baseUrl, title) {
  const candidate = [
    "meta[property='og:image']",
    "meta[name='twitter:image']",
    "meta[name='twitter:image:src']",
    "meta[itemprop='image']",
  ]
    .map(selector => doc.querySelector(selector)?.getAttribute("content"))
    .find(Boolean);
  const src = resolveHttpUrl(candidate || "", baseUrl);
  return src
    ? `<figure><img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="eager" decoding="async"></figure>`
    : "";
}

function isPublicIntroParagraph(text) {
  if (text.length < 90 || text.length > 1500) return false;
  return !/(subscribe|subscription|sign in|register|log in|unlock|premium plan|continue reading|advertisement|cookie policy|privacy policy|related stories|most popular|recommended for you)/i.test(
    text
  );
}

function publicParagraphFallback(doc, currentContent) {
  const roots = [
    doc.querySelector("article"),
    doc.querySelector("main"),
    doc.body,
  ].filter(Boolean);
  const seen = new Set();
  const paragraphs = [];

  for (const root of roots) {
    for (const paragraph of root.querySelectorAll("p")) {
      if (
        paragraph.closest(
          "nav, header, footer, aside, form, [role='navigation'], [aria-label*='subscription' i]"
        )
      )
        continue;
      const text = normalizeWhitespace(paragraph.textContent || "");
      if (!isPublicIntroParagraph(text) || seen.has(text)) continue;
      seen.add(text);
      paragraphs.push(text);
      if (paragraphs.length === 5) break;
    }
    if (paragraphs.length === 5) break;
  }

  const currentText = textContentFromHtml(currentContent);
  const fallbackText = paragraphs.join(" ");
  if (paragraphs.length < 2 || fallbackText.length <= currentText.length + 120)
    return null;
  return {
    content: paragraphs.map(text => `<p>${escapeHtml(text)}</p>`).join(""),
    count: paragraphs.length,
  };
}

function contentMetrics(content) {
  const doc = new DOMParser().parseFromString(content || "", "text/html");
  const text = normalizeWhitespace(doc.body?.textContent || "");
  const paragraphs = Array.from(doc.querySelectorAll("p")).filter(
    paragraph => normalizeWhitespace(paragraph.textContent || "").length > 0
  ).length;
  return { text, paragraphs, characters: text.length };
}

export function isShortArticle({ paragraphs = 0, characters = 0 } = {}) {
  return (
    paragraphs < SHORT_ARTICLE_LIMITS.minParagraphs ||
    characters < SHORT_ARTICLE_LIMITS.minCharacters
  );
}

function createDocumentFromHtml(rawHtml) {
  if (typeof DOMParser === "undefined")
    throw new Error("This reader requires a browser DOM.");
  const doc = new DOMParser().parseFromString(rawHtml || "", "text/html");
  if (!doc?.body) throw new Error("The page returned invalid HTML.");
  return doc;
}

function extractFromHtml(rawHtml, url) {
  const doc = createDocumentFromHtml(rawHtml);
  const parsed = new Readability(doc.cloneNode(true), {
    keepClasses: false,
    charThreshold: 140,
  }).parse();
  const readabilityContent = parsed?.content?.trim() || "";
  if (!readabilityContent || !textContentFromHtml(readabilityContent))
    return null;

  const title = getTitleWithFallbacks(doc, parsed?.title || "");
  const fallback = publicParagraphFallback(doc, readabilityContent);
  const sourceContent = fallback?.content || readabilityContent;
  const content = sanitizeContent(sourceContent, {
    baseUrl: url,
    heroFallback: openGraphHeroImage(doc, url, title),
  });
  const metrics = contentMetrics(content);
  if (!metrics.text) return null;

  return {
    parsed,
    title,
    content,
    excerpt:
      normalizeWhitespace(parsed?.excerpt || "") || metrics.text.slice(0, 220),
    byline: normalizeWhitespace(parsed?.byline || ""),
    metrics,
    publicParagraphCount: fallback?.count || 0,
  };
}

function uniqueId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function minutesFor(text) {
  return Math.max(
    1,
    Math.ceil(
      normalizeWhitespace(text).split(/\s+/).filter(Boolean).length / 225
    )
  );
}

function hostnameFromUrl(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Return the normalized hostname used for source-name matching. */
export function domainFromUrl(value) {
  return hostnameFromUrl(value);
}

/** Map known publishers to display names and provide a readable fallback for unknown hosts. */
export function readableSourceName(value) {
  const hostname = hostnameFromUrl(value) || normalizeWhitespace(value);
  const mappedDomain = Object.keys(SOURCE_DOMAIN_NAMES).find(
    domain => hostname === domain || hostname.endsWith(`.${domain}`)
  );
  if (mappedDomain) return SOURCE_DOMAIN_NAMES[mappedDomain];
  if (!hostname) return "Saved page";
  return hostname;
}

function archiveLookupUrl(originalUrl) {
  return `https://r.jina.ai/http://archive.is/newest/${encodeURIComponent(originalUrl)}`;
}

async function requestText(
  url,
  {
    native,
    http = CapacitorHttp,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    headers = {},
  } = {}
) {
  if (native) {
    const response = await http.get({
      url,
      headers,
      responseType: "text",
      connectTimeout: timeoutMs,
      readTimeout: timeoutMs,
    });
    if (response.status < 200 || response.status >= 400)
      throw new Error(`Native request returned HTTP ${response.status}`);
    return typeof response.data === "string"
      ? response.data
      : String(response.data || "");
  }

  if (typeof fetchImpl !== "function")
    throw new Error("Fetch is unavailable in this WebView.");
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller
    ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
    : null;
  try {
    const response = await fetchImpl(url, {
      headers,
      signal: controller?.signal,
    });
    if (!response.ok)
      throw new Error(`Browser request returned HTTP ${response.status}`);
    return response.text();
  } finally {
    if (timeout) globalThis.clearTimeout(timeout);
  }
}

export async function fetchRawHtml(url, options = {}) {
  const {
    native = Capacitor.isNativePlatform(),
    http = CapacitorHttp,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    log = () => {},
    archive = false,
  } = options;
  const requestUrl = archive ? archiveLookupUrl(url) : url;
  log(
    archive
      ? "fetch.archive.start"
      : native
        ? "fetch.native.start"
        : "fetch.web.start",
    requestUrl
  );
  return requestText(requestUrl, {
    native,
    http,
    fetchImpl,
    timeoutMs,
    headers: {
      Accept: "text/html,application/xhtml+xml",
      ...(archive ? { "x-respond-with": "html", "x-no-cache": "true" } : {}),
    },
  });
}

/**
 * Fetch and extract an article. The archive request is attempted only when the
 * initial HTML response produces no article node/content; short public previews
 * are returned normally with previewOnly=true for the UI to explain.
 */
export async function extractArticle(url, options = {}) {
  const { log = () => {} } = options;
  const rawHtml = await fetchRawHtml(url, options);
  log(
    "extract.parse.start",
    `${rawHtml.length.toLocaleString()} bytes received`
  );

  let extracted = extractFromHtml(rawHtml, url);
  let retrievedFrom = "origin";

  if (!extracted) {
    log(
      "fetch.archive.fallback",
      "Initial response contained no article content; trying archive.is through r.jina.ai"
    );
    try {
      const archivedHtml = await fetchRawHtml(url, {
        ...options,
        archive: true,
      });
      log(
        "extract.archive.parse.start",
        `${archivedHtml.length.toLocaleString()} bytes received`
      );
      extracted = extractFromHtml(archivedHtml, url);
      if (extracted) retrievedFrom = "archive.is via r.jina.ai";
    } catch (error) {
      log(
        "fetch.archive.failed",
        error instanceof Error ? error.message : "Archive request failed"
      );
    }
  }

  if (!extracted)
    throw new Error(
      "No article content was found in the page or its archive snapshot."
    );

  const source = readableSourceName(url);
  const previewOnly = isShortArticle(extracted.metrics);
  const article = {
    id: uniqueId(),
    url,
    title: extracted.title,
    byline: extracted.byline || source,
    source,
    content: extracted.content,
    excerpt: extracted.excerpt,
    readingMinutes: minutesFor(extracted.metrics.text),
    dateAdded: new Date().toISOString(),
    previewOnly,
    previewReason: previewOnly
      ? "The public extraction is shorter than three paragraphs or 1,200 characters."
      : "",
    retrievedFrom,
  };

  if (extracted.publicParagraphCount)
    log(
      "extract.public_fallback.used",
      `${extracted.publicParagraphCount} public introductory paragraphs retained`
    );
  log(
    "extract.images.prepared",
    `${new DOMParser().parseFromString(article.content, "text/html").images.length} image${new DOMParser().parseFromString(article.content, "text/html").images.length === 1 ? "" : "s"} ready`
  );
  log(
    "extract.parse.success",
    `${article.readingMinutes} min · ${extracted.metrics.characters.toLocaleString()} chars${previewOnly ? " · preview only" : ""}${retrievedFrom === "origin" ? "" : ` · ${retrievedFrom}`}`
  );
  return article;
}

/** Load the article array from localStorage. Returns null when the key is absent or invalid. */
export function loadArticlesFromStorage(storageKey = ARTICLE_STORAGE_KEY) {
  try {
    if (typeof globalThis.localStorage === "undefined") return null;
    const raw = globalThis.localStorage.getItem(storageKey);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Persist the article array in localStorage and report whether the write succeeded. */
export function saveArticlesToStorage(
  articles,
  storageKey = ARTICLE_STORAGE_KEY
) {
  try {
    if (typeof globalThis.localStorage === "undefined") return false;
    globalThis.localStorage.setItem(
      storageKey,
      JSON.stringify(Array.isArray(articles) ? articles : [])
    );
    return true;
  } catch {
    return false;
  }
}
