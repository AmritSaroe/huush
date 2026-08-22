import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { Readability } from "@mozilla/readability";

/**
 * whitemint — Article Extractor
 * Multi-strategy extraction with quality scoring.
 * Designed for Capacitor (native WebView, no CORS).
 *
 * Strategies:
 *   1. Direct fetch + Readability    — fastest, works for static sites
 *   2. Render-then-extract           — iframe + JS execution, catches lazy content
 *   3. Archive.org via Jina Reader  — last-resort recovery for blocked/empty pages
 */

// ─── Config ───
const CFG = {
  MIN_CHARS: 800,
  MIN_PARAGRAPHS: 3,
  RENDER_TIMEOUT: 6000,
  RENDER_SETTLE_MS: 800,
  RENDER_MIN_WAIT: 2000,
  FETCH_TIMEOUT: 15000,
};

const SOURCE_MAP = {
  "mybs.in": "Business Standard",
  "business-standard.com": "Business Standard",
  "livemint.com": "Live Mint",
  "economictimes.com": "Economic Times",
  "economictimes.indiatimes.com": "Economic Times",
  "indianexpress.com": "Indian Express",
  "thehindu.com": "The Hindu",
  "hindustantimes.com": "Hindustan Times",
  "indiatoday.in": "India Today",
  "ndtv.com": "NDTV",
  "timesofindia.indiatimes.com": "The Times of India",
  "reuters.com": "Reuters",
  "bbc.com": "BBC",
  "bbc.co.uk": "BBC",
  "theguardian.com": "The Guardian",
  "nytimes.com": "The New York Times",
  "washingtonpost.com": "Washington Post",
  "wsj.com": "Wall Street Journal",
  "ft.com": "Financial Times",
  "economist.com": "The Economist",
  "medium.com": "Medium",
  "substack.com": "Substack",
  "techcrunch.com": "TechCrunch",
  "wired.com": "Wired",
  "theverge.com": "The Verge",
  "cnbc.com": "CNBC",
  "bloomberg.com": "Bloomberg",
  "github.io": "GitHub",
  "wordpress.com": "WordPress",
  "ghost.io": "Ghost",
  "dev.to": "Dev.to",
};

const PAYWALL_PHRASES = [
  "subscribe now",
  "subscription required",
  "please log in",
  "sign in to read",
  "premium content",
  "continue reading",
  "exclusive story",
  "limited access",
  "get full access",
  "sign up to read",
  "unlock this article",
  "uh-oh! this is an exclusive",
  "this is a premium article",
  "you have reached your limit",
  "login to get access",
];

// ─── Utils ───
function clean(text = "") {
  return String(text).replace(/\s+/g, " ").trim();
}

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sourceName(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    const mappedDomain = Object.keys(SOURCE_MAP).find((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    return mappedDomain ? SOURCE_MAP[mappedDomain] : hostname;
  } catch {
    return "Article";
  }
}

function readTime(text = "") {
  return Math.max(1, Math.round(clean(text).split(/\s+/).filter(Boolean).length / 200));
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function textFromHtml(html = "") {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return clean(parsed.body?.textContent || "");
}

function paragraphCount(html = "") {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return Array.from(parsed.querySelectorAll("p")).filter((paragraph) => clean(paragraph.textContent || "")).length;
}

function isLowQuality(article) {
  if (!article) return true;
  return article.textContent.length < CFG.MIN_CHARS || paragraphCount(article.content) < CFG.MIN_PARAGRAPHS;
}

// ─── Quality Score ───
function score(article) {
  if (!article || !article.textContent) return -Infinity;
  const txt = article.textContent;
  const html = article.content || "";
  let value = 0;

  value += txt.length * 0.6;
  value += (html.match(/<p\b/gi) || []).length * 120;
  value += (html.match(/<h[2-6]\b/gi) || []).length * 60;
  value += article.title?.length > 15 ? 250 : 0;
  value += article.byline ? 80 : 0;
  value += (html.match(/<img\b/gi) || []).length * 30;

  const lower = txt.toLowerCase();
  PAYWALL_PHRASES.forEach((phrase) => {
    if (lower.includes(phrase)) value -= 400;
  });

  return value;
}

// ─── Sanitize ───
function sanitize(html = "", baseUrl = "", heroFallback = "") {
  const div = document.createElement("div");
  div.innerHTML = html;

  div.querySelectorAll(
    "script, style, iframe, object, embed, form, input, button, textarea, select, option, svg, canvas, meta, link, base, noscript, nav, aside"
  ).forEach((element) => element.remove());

  // Resolve lazy image candidates before removing data-* attributes.
  div.querySelectorAll("img").forEach((img) => {
    const candidates = [
      img.getAttribute("data-src"),
      img.getAttribute("data-original"),
      img.getAttribute("data-lazy-src"),
      img.getAttribute("src"),
    ];
    const src = candidates.find(Boolean);
    if (src) {
      try {
        const resolved = new URL(src, baseUrl || document.baseURI).href;
        if (!/^https?:$/i.test(new URL(resolved).protocol)) throw new Error("Unsupported image protocol");
        img.setAttribute("src", resolved);
        img.setAttribute("loading", "lazy");
        img.setAttribute("decoding", "async");
      } catch {
        img.remove();
      }
    } else {
      img.remove();
    }
    ["data-src", "data-original", "data-lazy-src", "srcset", "data-srcset", "sizes"].forEach((attribute) => img.removeAttribute(attribute));
  });

  div.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (name === "style" || name === "class" || name === "id" || name.startsWith("data-") || name.startsWith("on") || name === "srcdoc") {
        element.removeAttribute(attribute.name);
      }
    });
  });

  div.querySelectorAll("div, span, p").forEach((element) => {
    if (!element.textContent.trim() && !element.querySelector("img")) element.remove();
  });

  if (!div.firstElementChild && heroFallback) div.insertAdjacentHTML("afterbegin", heroFallback);
  return div.innerHTML;
}

/**
 * Compatibility export used by the existing reader's storage hydration path.
 * It accepts both the attached script's `(html, baseUrl)` form and the previous
 * whitemint adapter's `(html, { baseUrl, heroFallback })` form.
 */
export function sanitizeContent(html = "", baseUrl = "", heroFallback = "") {
  if (baseUrl && typeof baseUrl === "object") {
    heroFallback = baseUrl.heroFallback || "";
    baseUrl = baseUrl.baseUrl || "";
  }
  return sanitize(html, baseUrl, heroFallback);
}

// ─── Title Fix ───
function fixTitle(doc, readabilityTitle = "") {
  const candidates = [
    doc.querySelector('meta[property="og:title"]')?.content,
    doc.querySelector('meta[name="twitter:title"]')?.content,
    doc.querySelector('meta[name="title"]')?.content,
    doc.querySelector("article h1")?.textContent,
    doc.querySelector("h1")?.textContent,
    doc.querySelector('[itemprop="headline"]')?.textContent,
    readabilityTitle,
  ]
    .filter(Boolean)
    .map(clean);

  for (const title of candidates) {
    if (title.length > 10 && title.length < 200) return title;
  }
  return candidates[0] || "Untitled";
}

// ─── Byline Fix ───
function fixByline(doc, readabilityByline = "") {
  return clean(readabilityByline) ||
    clean(doc.querySelector('meta[name="author"]')?.content) ||
    clean(doc.querySelector('[itemprop="author"]')?.textContent) ||
    "";
}

// ─── Hero Image ───
function heroImage(doc, baseUrl, title) {
  const src = [
    doc.querySelector('meta[property="og:image"]')?.content,
    doc.querySelector('meta[name="twitter:image"]')?.content,
    doc.querySelector('meta[itemprop="image"]')?.content,
  ].find(Boolean);

  if (!src) return "";
  try {
    const url = new URL(src, baseUrl).href;
    return `<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(title)}" loading="eager" decoding="async"></figure>`;
  } catch {
    return "";
  }
}

// ─── Extract from parsed DOM ───
function extractFromDom(doc, url) {
  const clone = doc.cloneNode(true);
  const parsed = new Readability(clone, { charThreshold: 20 }).parse();
  if (!parsed) return null;

  const title = fixTitle(doc, parsed.title);
  const byline = fixByline(doc, parsed.byline);
  const content = sanitizeContent(parsed.content, url);
  const text = textFromHtml(content);

  if (!text || text.length < 100) return null;

  return {
    title,
    byline,
    content: heroImage(doc, url, title) + content,
    textContent: text,
    excerpt: text.slice(0, 240),
  };
}

async function requestHtml(url, { timeout = CFG.FETCH_TIMEOUT, preferNative = Capacitor.isNativePlatform() } = {}) {
  if (preferNative) {
    const response = await CapacitorHttp.get({
      url,
      responseType: "text",
      connectTimeout: timeout,
      readTimeout: timeout,
      headers: {
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (response.status < 200 || response.status >= 400) throw new Error(`HTTP ${response.status}`);
    return typeof response.data === "string" ? response.data : String(response.data || "");
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;
  try {
    const response = await fetch(url, {
      signal: controller?.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ─── Strategy 1: Direct Fetch ───
async function strategyDirect(url) {
  const html = await requestHtml(url);
  const doc = new DOMParser().parseFromString(html, "text/html");
  return extractFromDom(doc, url);
}

// ─── Strategy 2: Render-Then-Extract ───
async function strategyRender(url) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
    iframe.sandbox = "allow-same-origin allow-scripts";

    let done = false;
    let observer;
    let poll;
    let timeout;
    let mutations = 0;
    let lastMutation = Date.now();
    const start = Date.now();

    const cleanup = () => {
      if (done) return;
      done = true;
      if (observer) observer.disconnect();
      if (poll) clearInterval(poll);
      if (timeout) clearTimeout(timeout);
      iframe.remove();
    };

    const fail = (message) => {
      if (done) return;
      cleanup();
      reject(new Error(message));
    };

    const finish = (result) => {
      if (done) return;
      if (!result) {
        fail("Readability returned null from rendered DOM");
        return;
      }
      cleanup();
      resolve(result);
    };

    timeout = setTimeout(() => fail("Render timeout"), CFG.RENDER_TIMEOUT);

    iframe.onload = () => {
      const idoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!idoc) {
        fail("No iframe document");
        return;
      }

      lastMutation = Date.now();
      observer = new MutationObserver(() => {
        mutations++;
        lastMutation = Date.now();
      });
      if (idoc.body) observer.observe(idoc.body, { childList: true, subtree: true, characterData: true });

      setTimeout(() => {
        try {
          idoc.scrollingElement?.scrollTo(0, idoc.scrollingElement.scrollHeight);
        } catch {
          // Some WebViews do not expose scrollingElement.scrollTo for cross-origin frames.
        }
      }, 600);

      poll = setInterval(() => {
        if (done) return;

        const idle = Date.now() - lastMutation;
        const elapsed = Date.now() - start;
        const hasBodyText = clean(idoc.body?.textContent || "").length > 100;
        const settled = idle > CFG.RENDER_SETTLE_MS && (mutations > 0 || hasBodyText);
        const minMet = elapsed > CFG.RENDER_MIN_WAIT;

        if (settled && minMet) {
          try {
            finish(extractFromDom(idoc, url));
          } catch (error) {
            fail(error instanceof Error ? error.message : "Rendered extraction failed");
          }
        }
      }, 200);
    };

    iframe.onerror = () => fail("Iframe load error");
    document.body.appendChild(iframe);
    iframe.src = url;
  });
}

// ─── Strategy 3: Archive.org Fallback ───
function archiveReaderUrl(url) {
  return `https://r.jina.ai/https://web.archive.org/web/2if_/${url}`;
}

async function strategyArchive(url) {
  const html = await requestHtml(archiveReaderUrl(url), { preferNative: Capacitor.isNativePlatform() });
  const doc = new DOMParser().parseFromString(html, "text/html");
  return extractFromDom(doc, url);
}

// ─── Master Extractor ───
export async function extractArticle(url) {
  const results = [];
  const errors = [];

  const runStrategy = async (name, fn) => {
    try {
      const raw = await fn();
      if (!raw) return;
      results.push({ ...raw, _strategy: name, _score: score(raw) });
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  await runStrategy("direct", () => strategyDirect(url));

  // Render only when direct extraction is absent or looks too short. This keeps
  // ordinary pages fast while still giving lazy-rendered publishers a chance.
  const directBest = results[0];
  if (!directBest || isLowQuality(directBest)) await runStrategy("render", () => strategyRender(url));

  // Try the public Wayback snapshot when the origin and rendered attempts do
  // not produce a substantial article. This is a recovery path, not a login or
  // paywall bypass, and may legitimately return no snapshot.
  const bestBeforeArchive = results.slice().sort((a, b) => b._score - a._score)[0];
  if (!bestBeforeArchive || isLowQuality(bestBeforeArchive)) await runStrategy("archive.org", () => strategyArchive(url));

  if (results.length === 0) {
    const reason = errors.length ? ` ${errors.join("; ")}` : "";
    throw new Error(`Could not extract article. This site may require a subscription or block automated access.${reason}`);
  }

  results.sort((a, b) => b._score - a._score);
  const best = results[0];
  const isPreview = isLowQuality(best);

  return {
    id: uid(),
    url,
    title: best.title,
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

// ─── Validation ───
export function validateUrl(value) {
  try {
    const u = new URL(value);
    return ["http:", "https:"].includes(u.protocol);
  } catch {
    return false;
  }
}

// ─── Storage helpers ───
const STORAGE_KEY = "whitemint:articles";

export function loadArticles() {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveArticles(articles) {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(articles) ? articles : []));
    return true;
  } catch {
    return false;
  }
}
