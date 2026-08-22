/**
 * whitemint — Article Extractor
 * Three-strategy extraction with quality scoring.
 *
 * Strategies:
 *   1. Direct fetch + Readability          — fastest
 *   2. Direct fetch + deep paragraph scrape — when Readability under-extracts
 *   3. Render-then-extract                  — iframe, last resort
 */

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
  "subscribe now", "subscription required", "please log in",
  "sign in to read", "premium content", "continue reading",
  "exclusive story", "limited access", "get full access",
  "sign up to read", "unlock this article",
  "uh-oh! this is an exclusive", "this is a premium article",
  "you have reached your limit", "login to get access",
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
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    return SOURCE_MAP[h] || h;
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

// ─── Quality Score ───
function score(article) {
  if (!article || !article.textContent) return -Infinity;
  const txt = article.textContent;
  const html = article.content || "";
  let s = 0;
  s += txt.length * 0.6;
  s += (html.match(/<p/gi) || []).length * 120;
  s += (html.match(/<h[2-6]/gi) || []).length * 60;
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
  div.querySelectorAll(
    "script, style, iframe, object, embed, form, input, button, textarea, select, option, svg, canvas, meta, link, base, noscript, nav, aside"
  ).forEach(el => el.remove());
  div.querySelectorAll("*").forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      const n = attr.name.toLowerCase();
      if (n === "style" || n === "class" || n === "id" || n.startsWith("data-") || n.startsWith("on") || n === "srcdoc") {
        el.removeAttribute(attr.name);
      }
    });
  });
  div.querySelectorAll("img").forEach(img => {
    const candidates = [img.getAttribute("data-src"), img.getAttribute("data-original"), img.getAttribute("data-lazy-src"), img.getAttribute("src")];
    const src = candidates.find(Boolean);
    if (src) {
      try { img.setAttribute("src", new URL(src, baseUrl).href); img.setAttribute("loading", "lazy"); img.setAttribute("decoding", "async"); }
      catch { img.remove(); }
    } else { img.remove(); }
    ["data-src", "data-original", "data-lazy-src", "srcset", "data-srcset", "sizes"].forEach(a => img.removeAttribute(a));
  });
  div.querySelectorAll("div, span, p").forEach(el => {
    if (!el.textContent.trim() && !el.querySelector("img")) el.remove();
  });
  return div.innerHTML;
}

// ─── Title / Byline / Hero ───
function fixTitle(doc, readabilityTitle = "") {
  const candidates = [
    doc.querySelector('meta[property="og:title"]')?.content,
    doc.querySelector('meta[name="twitter:title"]')?.content,
    doc.querySelector('meta[name="title"]')?.content,
    doc.querySelector("article h1")?.textContent,
    doc.querySelector("h1")?.textContent,
    doc.querySelector('[itemprop="headline"]')?.textContent,
    readabilityTitle,
  ].filter(Boolean).map(clean);
  for (const t of candidates) { if (t.length > 10 && t.length < 200) return t; }
  return candidates[0] || "Untitled";
}

function fixByline(doc, readabilityByline = "") {
  return clean(readabilityByline) || clean(doc.querySelector('meta[name="author"]')?.content) || clean(doc.querySelector('[itemprop="author"]')?.textContent) || "";
}

function heroImage(doc, baseUrl, title) {
  const src = [doc.querySelector('meta[property="og:image"]')?.content, doc.querySelector('meta[name="twitter:image"]')?.content, doc.querySelector('meta[itemprop="image"]')?.content].find(Boolean);
  if (!src) return "";
  try { return `<figure><img src="${escapeHtml(new URL(src, baseUrl).href)}" alt="${escapeHtml(title)}" loading="eager" decoding="async"></figure>`; }
  catch { return ""; }
}

// ─── Extract from DOM via Readability ───
function extractFromDom(doc, url) {
  const clone = doc.cloneNode(true);
  const parsed = new Readability(clone, { charThreshold: 20 }).parse();
  if (!parsed) return null;
  const title = fixTitle(doc, parsed.title);
  const byline = fixByline(doc, parsed.byline);
  const content = sanitize(parsed.content, url);
  const text = clean((new DOMParser().parseFromString(content, "text/html")).body?.textContent || "");
  if (!text || text.length < 100) return null;
  return { title, byline, content: heroImage(doc, url, title) + content, textContent: text, excerpt: text.slice(0, 240) };
}

// ─── DEEP SCRAPE: When Readability under-extracts, grab all body paragraphs ───
function deepScrape(doc, url, existingTitle = "", existingByline = "") {
  const title = existingTitle || fixTitle(doc, "");
  const byline = existingByline || fixByline(doc, "");

  // Try known article containers first
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
  for (const sel of selectors) {
    root = doc.querySelector(sel);
    if (root) break;
  }
  if (!root) root = doc.body;

  const paragraphs = [];
  const seen = new Set();

  for (const p of root.querySelectorAll("p")) {
    // Skip nav/header/footer/aside elements
    if (p.closest("nav, header, footer, aside, form, [role='navigation']")) continue;

    const text = clean(p.textContent || "");
    if (!text || text.length < 40) continue; // Skip very short lines
    if (seen.has(text)) continue;

    // Skip paywall/sidebar paragraphs
    const lower = text.toLowerCase();
    if (PAYWALL_PHRASES.some(ph => lower.includes(ph))) continue;
    if (/^(related|also read|trending|recommended|advertisement|copyright|disclaimer)/i.test(text)) continue;

    seen.add(text);
    paragraphs.push(text);
  }

  if (paragraphs.length < 2) return null;

  const html = paragraphs.map(t => `<p>${escapeHtml(t)}</p>`).join("");
  const text = paragraphs.join(" ");

  return {
    title,
    byline,
    content: heroImage(doc, url, title) + html,
    textContent: text,
    excerpt: text.slice(0, 240),
  };
}

// ─── Strategy 1: Direct Fetch ───
async function strategyDirect(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CFG.FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    return extractFromDom(doc, url);
  } finally { clearTimeout(timer); }
}

// ─── Strategy 2: Direct Fetch + Deep Scrape ───
async function strategyDeepScrape(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CFG.FETCH_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    return deepScrape(doc, url);
  } finally { clearTimeout(timer); }
}

// ─── Strategy 3: Render-Then-Extract ───
async function strategyRender(url) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;";
    // NOTE: no sandbox — many news sites break with sandbox restrictions

    let done = false;
    let mutations = 0;
    let lastMutation = Date.now();
    const start = Date.now();

    const cleanup = () => { done = true; if (iframe.parentNode) iframe.parentNode.removeChild(iframe); };
    const fail = (msg) => { if (!done) { done = true; cleanup(); reject(new Error(msg)); } };
    const timeout = setTimeout(() => fail("Render timeout"), CFG.RENDER_TIMEOUT);

    iframe.onload = () => {
      const idoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!idoc) { fail("No iframe document"); return; }

      const observer = new MutationObserver(() => { mutations++; lastMutation = Date.now(); });
      if (idoc.body) observer.observe(idoc.body, { childList: true, subtree: true, characterData: true });

      setTimeout(() => { try { idoc.scrollingElement?.scrollTo(0, idoc.scrollingElement.scrollHeight); } catch {} }, 600);

      const poll = setInterval(() => {
        if (done) { clearInterval(poll); return; }
        const idle = Date.now() - lastMutation;
        const elapsed = Date.now() - start;
        const settled = (idle > CFG.RENDER_SETTLE_MS && mutations > 0) || elapsed > CFG.RENDER_TIMEOUT;
        const minMet = elapsed > CFG.RENDER_MIN_WAIT;

        if (settled && minMet) {
          clearInterval(poll); clearTimeout(timeout); observer.disconnect();
          try {
            const result = extractFromDom(idoc, url);
            cleanup();
            if (result) resolve(result);
            else reject(new Error("Readability returned null from rendered DOM"));
          } catch (e) { cleanup(); reject(e); }
        }
      }, 200);
    };

    iframe.onerror = () => fail("Iframe load error");
    document.body.appendChild(iframe);
    iframe.src = url;
  });
}

// ─── Master Extractor ───
export async function extractArticle(url) {
  const strategies = [
    { name: "direct", fn: () => strategyDirect(url) },
    { name: "deep", fn: () => strategyDeepScrape(url) },
    { name: "render", fn: () => strategyRender(url) },
  ];

  const results = [];
  const errors = [];

  for (const strat of strategies) {
    try {
      const raw = await strat.fn();
      if (!raw) continue;
      const scored = { ...raw, _strategy: strat.name, _score: score(raw) };
      results.push(scored);
      if (scored._score > 2500) break;
    } catch (e) {
      errors.push(`${strat.name}: ${e.message}`);
    }
  }

  if (results.length === 0) {
    throw new Error(`Could not extract article. This site may require a subscription or block automated access.`);
  }

  results.sort((a, b) => b._score - a._score);
  const best = results[0];

  const isPreview = best.textContent.length < CFG.MIN_CHARS || (best.content.match(/<p/gi) || []).length < CFG.MIN_PARAGRAPHS;

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
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : []; }
  catch { return []; }
}
export function saveArticles(articles) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(articles)); return true; }
  catch { return false; }
}
