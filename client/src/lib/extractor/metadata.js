export const SOURCE_MAP = {
  "mybs.in": "Business Standard",
  "business-standard.com": "Business Standard",
  "livemint.com": "Live Mint",
  "economictimes.com": "Economic Times",
  "economictimes.indiatimes.com": "Economic Times",
  "indianexpress.com": "Indian Express",
  "thehindu.com": "The Hindu",
  "thehindubusinessline.com": "BusinessLine",
  "financialexpress.com": "Financial Express",
  "finshots.in": "Finshots",
  "pib.gov.in": "Press Information Bureau",
  "epw.in": "Economic & Political Weekly",
  "hindustantimes.com": "Hindustan Times",
  "indiatoday.in": "India Today",
  "ndtv.com": "NDTV",
  "timesofindia.indiatimes.com": "The Times of India",
  "reuters.com": "Reuters",
  "bbc.com": "BBC",
  "bbc.co.uk": "BBC",
  "theguardian.com": "The Guardian",
  "nytimes.com": "The New York Times",
  "medium.com": "Medium",
  "substack.com": "Substack",
  "bloomberg.com": "Bloomberg",
  "cnbc.com": "CNBC",
};

function clean(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function sourceName(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (hostname === "localhost" || hostname === "::1" || /^\[?[0-9a-f:]+\]?$/i.test(hostname) || /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname)) return "Local source";
    const mapped = Object.keys(SOURCE_MAP).find((domain) => hostname === domain || hostname.endsWith(`.${domain}`));
    if (mapped) return SOURCE_MAP[mapped];
    const parts = hostname.split(".").filter(Boolean);
    const compoundTlds = new Set(["co.uk", "org.uk", "com.au", "co.in", "com.br", "co.nz"]);
    const suffix = parts.slice(-2).join(".");
    const brand = parts[Math.max(0, parts.length - (compoundTlds.has(suffix) ? 3 : 2))] || hostname;
    return brand.split(/[-_]+/).filter(Boolean).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ") || "Article";
  } catch {
    return "Article";
  }
}

export function cleanText(value = "") {
  return clean(value);
}

export function readTime(text = "") {
  const words = clean(text).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function createId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeAttribute(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function imageIdentity(value, baseUrl) {
  try {
    const parsed = new URL(value, baseUrl);
    let pathname = parsed.pathname.replace(/\/+$/, "").toLowerCase();
    if (parsed.hostname.toLowerCase().endsWith("livemint.com")) {
      pathname = pathname.replace(/\/(?:\d+x\d+)(?:\/logo)?(?=\/)/i, "");
      return `${parsed.hostname.toLowerCase()}${pathname}`;
    }
    return `${parsed.hostname.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    return String(value || "").trim().toLowerCase();
  }
}

export function fixTitle(doc, fallback = "") {
  const candidates = [
    doc?.querySelector('meta[property="og:title"]')?.content,
    doc?.querySelector('meta[name="twitter:title"]')?.content,
    doc?.querySelector("article h1")?.textContent,
    doc?.querySelector("h1")?.textContent,
    fallback,
  ].filter(Boolean).map(clean);
  for (const title of candidates) {
    if (title.length > 10 && title.length < 240) return title;
  }
  return candidates[0] || "Untitled";
}

export function fixByline(doc, fallback = "") {
  return clean(fallback)
    || clean(doc?.querySelector('meta[name="author"]')?.content)
    || clean(doc?.querySelector('[itemprop="author"]')?.textContent)
    || clean(doc?.querySelector(".byline, [class*='byline'], [data-author]")?.textContent)
    || "";
}

export function getHeroImageUrl(doc, baseUrl) {
  const source = [
    doc?.querySelector('meta[property="og:image"]')?.content,
    doc?.querySelector('meta[name="twitter:image"]')?.content,
    doc?.querySelector('meta[name="twitter:image:src"]')?.content,
  ].find(Boolean);
  if (!source) return "";
  try { return new URL(source, baseUrl).href; } catch { return ""; }
}

export function stripImageByIdentity(html = "", imageUrl = "", baseUrl = "") {
  if (!html || !imageUrl) return html;
  const targetIdentity = imageIdentity(imageUrl, baseUrl);
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("img").forEach((image) => {
    const source = image.getAttribute("src");
    if (!source || imageIdentity(source, baseUrl) !== targetIdentity) return;
    const figure = image.closest("figure");
    if (figure && figure.querySelectorAll("img").length === 1) figure.remove();
    else image.remove();
  });
  container.querySelectorAll("picture").forEach((picture) => {
    if (picture.querySelector("img")) return;
    const figure = picture.closest("figure");
    if (figure && !figure.querySelector("img")) figure.remove();
    else picture.remove();
  });
  return container.innerHTML;
}

export function heroImage(doc, baseUrl, title) {
  const resolved = getHeroImageUrl(doc, baseUrl);
  if (!resolved) return "";
  return `<figure><img src="${escapeAttribute(resolved)}" alt="${escapeAttribute(title)}" loading="eager" decoding="async"></figure>`;
}
