/**
 * whitemint — Article Extractor v3
 * Extracts article data from embedded JSON (ld+json, initial state, API responses)
 * before falling back to Readability and paragraph scraping.
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

function clean(text = "") { return String(text).replace(/\s+/g, " ").trim(); }
function uid() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
function sourceName(url) {
  try { const h = new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, ""); return SOURCE_MAP[h] || h; }
  catch { return "Article"; }
}
function readTime(text = "") { return Math.max(1, Math.round(clean(text).split(/\s+/).filter(Boolean).length / 200)); }
function escapeHtml(str = "") { return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

function score(article) {
  if (!article || !article.textContent) return -Infinity;
  const txt = article.textContent, html = article.content || ""; let s = 0;
  s += txt.length * 0.6; s += (html.match(/<p/gi) || []).length * 120;
  s += (html.match(/<h[2-6]/gi) || []).length * 60;
  s += article.title?.length > 15 ? 250 : 0; s += article.byline ? 80 : 0;
  const lower = txt.toLowerCase();
  ["subscribe now", "subscription required", "please log in", "sign in to read",
   "premium content", "continue reading", "exclusive story", "limited access",
   "get full access", "sign up to read", "unlock this article"].forEach(p => { if (lower.includes(p)) s -= 400; });
  return s;
}

function sanitize(html = "", baseUrl = "") {
  const div = document.createElement("div"); div.innerHTML = html;
  div.querySelectorAll("script, style, iframe, object, embed, form, input, button, textarea, select, option, svg, canvas, meta, link, base, noscript, nav, aside").forEach(el => el.remove());
  div.querySelectorAll("*").forEach(el => { Array.from(el.attributes).forEach(attr => { const n = attr.name.toLowerCase(); if (n === "style" || n === "class" || n === "id" || n.startsWith("data-") || n.startsWith("on") || n === "srcdoc") el.removeAttribute(attr.name); }); });
  div.querySelectorAll("img").forEach(img => {
    const src = [img.getAttribute("data-src"), img.getAttribute("data-original"), img.getAttribute("data-lazy-src"), img.getAttribute("src")].find(Boolean);
    if (src) { try { img.setAttribute("src", new URL(src, baseUrl).href); img.setAttribute("loading", "lazy"); } catch { img.remove(); } }
    else { img.remove(); }
    ["data-src", "data-original", "data-lazy-src", "srcset", "data-srcset", "sizes"].forEach(a => img.removeAttribute(a));
  });
  div.querySelectorAll("div, span, p").forEach(el => { if (!el.textContent.trim() && !el.querySelector("img")) el.remove(); });
  return div.innerHTML;
}

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

// ─── STRATEGY 1: Extract from JSON in script tags ───
// Many sites embed article data as JSON in <script type="application/ld+json">
// or in window.__INITIAL_STATE__ variables.
function extractFromJson(doc, url) {
  let data = null;

  // Try ld+json (Schema.org Article)
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const json = JSON.parse(script.textContent);
      const article = Array.isArray(json) ? json.find(item => item['@type'] === 'NewsArticle' || item['@type'] === 'Article') : json;
      if (article && (article.articleBody || article.description)) {
        data = article;
        break;
      }
    } catch {}
  }

  // Try window.__INITIAL_STATE__ or similar
  if (!data) {
    for (const script of doc.querySelectorAll('script')) {
      const text = script.textContent || '';
      const patterns = [
        /window\.__INITIAL_STATE__\s*=\s*(\{.*?\});/s,
        /window\.__DATA__\s*=\s*(\{.*?\});/s,
        /window\.appState\s*=\s*(\{.*?\});/s,
      ];
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          try {
            const parsed = JSON.parse(match[1]);
            // Navigate common nested paths
            const article = parsed?.article || parsed?.data?.article || parsed?.page?.article || parsed?.content?.article || parsed?.state?.article;
            if (article && (article.body || article.content || article.articleBody || article.text)) {
              data = article;
              break;
            }
          } catch {}
        }
      }
      if (data) break;
    }
  }

  if (!data) return null;

  const title = clean(data.headline || data.title || fixTitle(doc, ''));
  const byline = clean(data.author?.name || data.byline || fixByline(doc, ''));
  let body = data.articleBody || data.body || data.content || data.text || '';

  // Some JSON stores body as HTML, some as plain text
  let content;
  if (body.includes('<')) {
    // Already HTML
    content = sanitize(body, url);
  } else {
    // Plain text — wrap paragraphs
    const paragraphs = body.split(/\n{2,}/).map(p => `<p>${escapeHtml(p.trim())}</p>`).join('');
    content = paragraphs;
  }

  const text = clean((new DOMParser().parseFromString(content, "text/html")).body?.textContent || body);
  if (!text || text.length < 200) return null;

  return {
    title,
    byline,
    content: heroImage(doc, url, title) + content,
    textContent: text,
    excerpt: text.slice(0, 240),
  };
}

// ─── STRATEGY 2: Readability ───
function extractFromDom(doc, url) {
  const parsed = new Readability(doc.cloneNode(true), { charThreshold: 20 }).parse();
  if (!parsed) return null;
  const title = fixTitle(doc, parsed.title);
  const byline = fixByline(doc, parsed.byline);
  const content = sanitize(parsed.content, url);
  const text = clean((new DOMParser().parseFromString(content, "text/html")).body?.textContent || "");
  if (!text || text.length < 100) return null;
  return { title, byline, content: heroImage(doc, url, title) + content, textContent: text, excerpt: text.slice(0, 240) };
}

// ─── STRATEGY 3: Deep paragraph scrape ───
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
    if (!text || text.length < 40) continue;
    if (seen.has(text)) continue;
    const lower = text.toLowerCase();
    if (["subscribe now", "subscription required", "please log in", "sign in to read", "premium content", "continue reading", "exclusive story", "limited access"].some(ph => lower.includes(ph))) continue;
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
    return await res.text();
  } finally { clearTimeout(timer); }
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

  if (results.length === 0) {
    throw new Error("Could not extract article. This site may require a subscription.");
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
