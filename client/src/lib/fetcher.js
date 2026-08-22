import { Readability } from "@mozilla/readability";

/**
 * whitemint — Article Extractor v3.1
 *
 * Strategy order:
 *   1. Embedded JSON — handles publishers that keep the full article outside
 *      visible HTML paragraphs, including Next.js __NEXT_DATA__ payloads.
 *   2. Readability — handles ordinary article markup.
 *   3. Deep paragraph scrape — recovers content when Readability under-extracts.
 */

const CFG = {
  MIN_CHARS: 800,
  MIN_PARAGRAPHS: 3,
  FETCH_TIMEOUT: 15000,
};

const SOURCE_MAP = {
  "mybs.in": "Business Standard", "business-standard.com": "Business Standard",
  "livemint.com": "Live Mint",
  "economictimes.com": "Economic Times", "economictimes.indiatimes.com": "Economic Times",
  "indianexpress.com": "Indian Express", "thehindu.com": "The Hindu",
  "hindustantimes.com": "Hindustan Times", "indiatoday.in": "India Today",
  "ndtv.com": "NDTV", "timesofindia.indiatimes.com": "The Times of India",
  "reuters.com": "Reuters", "bbc.com": "BBC", "bbc.co.uk": "BBC",
  "theguardian.com": "The Guardian", "nytimes.com": "The New York Times",
  "medium.com": "Medium", "substack.com": "Substack",
  "bloomberg.com": "Bloomberg", "cnbc.com": "CNBC",
};

const PAYWALL_PHRASES = [
  "subscribe now", "subscription required", "please log in", "sign in to read",
  "premium content", "continue reading", "exclusive story", "limited access",
  "get full access", "sign up to read", "unlock this article",
];

// ─── Utils ───
function clean(text = "") { return String(text).replace(/\s+/g, " ").trim(); }
function uid() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
function sourceName(url) {
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    const mapped = Object.keys(SOURCE_MAP).find(domain => h === domain || h.endsWith(`.${domain}`));
    return mapped ? SOURCE_MAP[mapped] : h;
  } catch { return "Article"; }
}
function readTime(text = "") { return Math.max(1, Math.round(clean(text).split(/\s+/).filter(Boolean).length / 200)); }
function escapeHtml(str = "") { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function textFromHtml(html = "") {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return clean(doc.body?.textContent || "");
}

function blockCount(html = "") {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.querySelectorAll("p, div").length;
}

function isLowQuality(article) {
  return !article || article.textContent.length < CFG.MIN_CHARS || blockCount(article.content) < CFG.MIN_PARAGRAPHS;
}

// ─── Quality Score ───
function score(article) {
  if (!article || !article.textContent) return -Infinity;
  const txt = article.textContent;
  const html = article.content || "";
  let s = 0;
  s += txt.length * 0.6;
  s += (html.match(/<p\b/gi) || []).length * 120;
  s += (html.match(/<h[2-6]\b/gi) || []).length * 60;
  s += article.title?.length > 15 ? 250 : 0;
  s += article.byline ? 80 : 0;
  const lower = txt.toLowerCase();
  PAYWALL_PHRASES.forEach(p => { if (lower.includes(p)) s -= 400; });
  return s;
}

// ─── Sanitize ───
function sanitize(html = "", baseUrl = "") {
  const div = document.createElement("div");
  div.innerHTML = html;
  div.querySelectorAll("script, style, iframe, object, embed, form, input, button, textarea, select, option, svg, canvas, meta, link, base, noscript, nav, aside").forEach(el => el.remove());

  // Resolve lazy image URLs before removing data-* attributes.
  div.querySelectorAll("img").forEach(img => {
    const src = [img.getAttribute("data-src"), img.getAttribute("data-original"), img.getAttribute("data-lazy-src"), img.getAttribute("src")].find(Boolean);
    if (src) {
      try {
        const resolved = new URL(src, baseUrl || document.baseURI);
        if (!/^https?:$/i.test(resolved.protocol)) throw new Error("Unsupported image protocol");
        img.setAttribute("src", resolved.href);
        img.setAttribute("loading", "lazy");
      } catch { img.remove(); }
    } else { img.remove(); }
    ["data-src", "data-original", "data-lazy-src", "srcset", "data-srcset", "sizes"].forEach(a => img.removeAttribute(a));
  });

  div.querySelectorAll("*").forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      const n = attr.name.toLowerCase();
      if (n === "style" || n === "class" || n === "id" || n.startsWith("data-") || n.startsWith("on") || n === "srcdoc") el.removeAttribute(attr.name);
    });
  });
  div.querySelectorAll("div, span, p").forEach(el => { if (!el.textContent.trim() && !el.querySelector("img")) el.remove(); });
  return div.innerHTML;
}

// ─── Title / Byline / Hero ───
function fixTitle(doc, fallback = "") {
  const candidates = [
    doc.querySelector('meta[property="og:title"]')?.content,
    doc.querySelector('meta[name="twitter:title"]')?.content,
    doc.querySelector("article h1")?.textContent,
    doc.querySelector("h1")?.textContent,
    fallback,
  ].filter(Boolean).map(clean);
  for (const t of candidates) { if (t.length > 10 && t.length < 200) return t; }
  return candidates[0] || "Untitled";
}

function fixByline(doc, fallback = "") {
  return clean(fallback) || clean(doc.querySelector('meta[name="author"]')?.content) || clean(doc.querySelector('[itemprop="author"]')?.textContent) || "";
}

function heroImage(doc, baseUrl, title) {
  const src = [doc.querySelector('meta[property="og:image"]')?.content, doc.querySelector('meta[name="twitter:image"]')?.content].find(Boolean);
  if (!src) return "";
  try { return `<figure><img src="${escapeHtml(new URL(src, baseUrl).href)}" alt="${escapeHtml(title)}" loading="eager" decoding="async"></figure>`; }
  catch { return ""; }
}

// ─── Embedded JSON extraction ───
function bodyFromRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return "";
  return [record.htmlContent, record.articleBody, record.body, record.content, record.text]
    .find(value => typeof value === "string" && clean(value).length >= 200) || "";
}

function looksLikeArticleRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = bodyFromRecord(value);
  const title = value.headline || value.title || value.pageTitle || value.meta_title || value.story_page_meta_title;
  return Boolean(body && (title || value.author || value.authorName || value.byline || value.metaDescription || value.metaDescription));
}

function findArticleRecord(value, seen = new Set(), depth = 0) {
  if (!value || typeof value !== "object" || seen.has(value) || depth > 12) return null;
  seen.add(value);
  if (looksLikeArticleRecord(value)) return value;

  const priorityKeys = ["article", "articleData", "pageProps", "data", "page", "story", "content", "props", "state", "initialState"];
  for (const key of priorityKeys) {
    if (value[key]) {
      const found = findArticleRecord(value[key], seen, depth + 1);
      if (found) return found;
    }
  }
  for (const child of Object.values(value)) {
    const found = findArticleRecord(child, seen, depth + 1);
    if (found) return found;
  }
  return null;
}

function parseJsonScript(script) {
  try {
    const text = script.textContent || "";
    return text.trim() ? JSON.parse(text) : null;
  } catch { return null; }
}

function parseAssignedObject(text, token) {
  const assignment = text.indexOf(token);
  if (assignment < 0) return null;
  const start = text.indexOf("{", assignment);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') { inString = true; continue; }
    if (character === "{") depth++;
    if (character === "}") {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, index + 1)); }
        catch { return null; }
      }
    }
  }
  return null;
}

function extractFromJson(doc, url) {
  let data = null;

  // Business Standard and several Next.js publishers put the complete article
  // under props.pageProps.data.htmlContent inside __NEXT_DATA__.
  const nextScript = doc.querySelector('script#__NEXT_DATA__, script[type="application/json"][id="__NEXT_DATA__"]');
  if (nextScript) data = findArticleRecord(parseJsonScript(nextScript));

  // Try Schema.org JSON-LD. A description-only JSON-LD record is intentionally
  // ignored because it is usually just the teaser, not the article body.
  if (!data) {
    for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
      const article = findArticleRecord(parseJsonScript(script));
      if (article) { data = article; break; }
    }
  }

  // Try common global state assignments used by publisher applications.
  if (!data) {
    const tokens = ["window.__INITIAL_STATE__", "window.__DATA__", "window.appState"];
    for (const script of doc.querySelectorAll("script")) {
      const text = script.textContent || "";
      for (const token of tokens) {
        const article = findArticleRecord(parseAssignedObject(text, token));
        if (article) { data = article; break; }
      }
      if (data) break;
    }
  }

  if (!data) return null;

  const title = clean(data.headline || data.title || data.pageTitle || data.meta_title || data.story_page_meta_title || fixTitle(doc, ""));
  const byline = clean(data.author?.name || data.authorName || data.byline || fixByline(doc, ""));
  const body = bodyFromRecord(data);
  if (!body) return null;

  let content;
  if (body.includes("<")) {
    content = sanitize(body, url);
  } else {
    const paragraphs = body.split(/\n{2,}/).map(p => `<p>${escapeHtml(p.trim())}</p>`).join("");
    content = paragraphs;
  }

  const text = textFromHtml(content) || clean(body);
  if (!text || text.length < 200) return null;

  return {
    title,
    byline,
    content: heroImage(doc, url, title) + content,
    textContent: text,
    excerpt: text.slice(0, 240),
  };
}

// ─── Strategy 2: Readability ───
function extractFromDom(doc, url) {
  const parsed = new Readability(doc.cloneNode(true), { charThreshold: 20 }).parse();
  if (!parsed) return null;
  const title = fixTitle(doc, parsed.title);
  const byline = fixByline(doc, parsed.byline);
  const content = sanitize(parsed.content, url);
  const text = textFromHtml(content);
  if (!text || text.length < 100) return null;
  return { title, byline, content: heroImage(doc, url, title) + content, textContent: text, excerpt: text.slice(0, 240) };
}

// ─── Strategy 3: Deep paragraph scrape ───
function deepScrape(doc, url, existingTitle = "", existingByline = "") {
  const title = existingTitle || fixTitle(doc, "");
  const byline = existingByline || fixByline(doc, "");
  const selectors = ["article", "[itemprop='articleBody']", ".article-content", ".story-content", ".main-content", ".content", "#article-body", ".entry-content", ".post-content"];
  let root = null;
  for (const sel of selectors) { root = doc.querySelector(sel); if (root) break; }
  if (!root) root = doc.body;

  const paragraphs = [], seen = new Set();
  for (const p of root.querySelectorAll("p")) {
    if (p.closest("nav, header, footer, aside, form, [role='navigation']")) continue;
    const text = clean(p.textContent || "");
    if (!text || text.length < 40 || seen.has(text)) continue;
    const lower = text.toLowerCase();
    if (PAYWALL_PHRASES.some(ph => lower.includes(ph))) continue;
    if (/^(related|also read|trending|recommended|advertisement|copyright|disclaimer)/i.test(text)) continue;
    seen.add(text);
    paragraphs.push(text);
  }

  if (paragraphs.length < 2) return null;
  const html = paragraphs.map(t => `<p>${escapeHtml(t)}</p>`).join("");
  const text = paragraphs.join(" ");
  return { title, byline, content: heroImage(doc, url, title) + html, textContent: text, excerpt: text.slice(0, 240) };
}

// ─── Fetch raw HTML ───
async function fetchHtml(url) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), CFG.FETCH_TIMEOUT) : null;
  try {
    const res = await fetch(url, {
      signal: controller?.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ─── Master Extractor ───
export async function extractArticle(url) {
  const html = await fetchHtml(url);
  const doc = new DOMParser().parseFromString(html, "text/html");

  const strategies = [
    { name: "json", fn: () => extractFromJson(doc, url) },
    { name: "readability", fn: () => extractFromDom(doc, url) },
    { name: "deep", fn: () => deepScrape(doc, url) },
  ];

  const results = [];
  for (const strat of strategies) {
    try {
      const raw = strat.fn();
      if (!raw) continue;
      const scored = { ...raw, _strategy: strat.name, _score: score(raw) };
      results.push(scored);
      if (scored._score > 2500) break;
    } catch (e) { console.log(`${strat.name} failed:`, e.message); }
  }

  if (results.length === 0) throw new Error("Could not extract article. This site may require a subscription.");

  results.sort((a, b) => b._score - a._score);
  const best = results[0];
  const isPreview = isLowQuality(best);

  return {
    id: uid(), url, title: best.title,
    byline: best.byline || sourceName(url),
    source: sourceName(url),
    content: best.content,
    textContent: best.textContent,
    excerpt: best.excerpt,
    readingMinutes: readTime(best.textContent),
    dateAdded: new Date().toISOString(),
    previewOnly: isPreview,
    strategy: best._strategy,
    score: Math.round(best._score),
  };
}

export function validateUrl(value) {
  try { const u = new URL(value); return ["http:", "https:"].includes(u.protocol); }
  catch { return false; }
}

const STORAGE_KEY = "whitemint:articles";
export function loadArticles() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
export function saveArticles(articles) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(articles) ? articles : []));
    return true;
  } catch { return false; }
}
