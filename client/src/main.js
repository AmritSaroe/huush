/**
 * Quiet Index design reminder: words lead, controls are precise, and every
 * diagnostic state is expressed with restrained monochrome clarity.
 */
import "./styles.css";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";

const KEYS = {
  articles: "whitemint:articles",
  settings: "whitemint:settings",
  logs: "whitemint:logs",
};

const LIMITS = { articles: 50, logs: 160 };

const DEFAULT_SETTINGS = { theme: "light", font: "sans", fontSize: 16 };

const FONTS = [
  { id: "sans", label: "Inter", family: "var(--font-sans)" },
  { id: "merriweather", label: "Merriweather", family: "var(--font-serif)" },
  { id: "source-serif", label: "Source Serif", family: "var(--font-serif-3)" },
  { id: "nunito", label: "Nunito", family: "var(--font-nunito)" },
  { id: "mono", label: "JetBrains", family: "var(--font-mono)" },
];

const state = {
  activeTab: "library",
  article: null,
  settingsOpen: false,
  articles: [],
  settings: { ...DEFAULT_SETTINGS },
  logs: [],
  busy: false,
  toast: null,
  loggedImageUrls: new Set(),
};

function normalizeSettings(saved = {}) {
  const legacySizes = { small: 15, normal: 16, large: 18 };
  const fontSize = Number.isFinite(Number(saved.fontSize))
    ? Number(saved.fontSize)
    : legacySizes[saved.size] || DEFAULT_SETTINGS.fontSize;
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    font: FONTS.some((font) => font.id === saved.font) ? saved.font : DEFAULT_SETTINGS.font,
    fontSize: Math.min(22, Math.max(14, Math.round(fontSize))),
  };
}

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const stripHtml = (value = "") => {
  const shell = document.createElement("div");
  shell.innerHTML = value;
  return (shell.textContent || shell.innerText || "").replace(/\s+/g, " ").trim();
};

const storage = {
  async get(key, fallback) {
    try {
      const { value } = await Preferences.get({ key });
      if (value) return JSON.parse(value);
    } catch (error) {
      console.warn("Preference read failed; using web storage", error);
    }
    try {
      const value = window.localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  },
  async set(key, value) {
    const serialised = JSON.stringify(value);
    try {
      await Preferences.set({ key, value: serialised });
    } catch (error) {
      console.warn("Preference write failed; using web storage", error);
    }
    try {
      window.localStorage.setItem(key, serialised);
    } catch {
      // The native Preferences value remains available if browser storage is unavailable.
    }
  },
};

function log(event, detail = "") {
  const entry = {
    time: new Date().toISOString(),
    event,
    detail: typeof detail === "string" ? detail : JSON.stringify(detail),
  };
  state.logs = [entry, ...state.logs].slice(0, LIMITS.logs);
  void storage.set(KEYS.logs, state.logs);
  if (state.activeTab === "debug") render();
}

function safeUrlForLog(value) {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "invalid URL";
  }
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
      new Date(value),
    );
  } catch {
    return "Saved";
  }
}

function formatClock(value) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(
      new Date(value),
    );
  } catch {
    return "--:--";
  }
}

function minutesFor(text) {
  return Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / 225));
}

function resolveArticleImageUrl(candidate, baseUrl) {
  if (!candidate) return "";
  try {
    const resolved = new URL(candidate.trim(), baseUrl);
    if (!/^https?:$/.test(resolved.protocol)) return "";
    if (resolved.protocol === "http:" && /^https:/i.test(baseUrl)) resolved.protocol = "https:";
    return resolved.href;
  } catch {
    return "";
  }
}

function bestSrcsetCandidate(value = "") {
  const entries = value
    .split(",")
    .map((entry) => entry.trim().split(/\s+/))
    .filter(([url]) => Boolean(url))
    .map(([url, descriptor = "1x"]) => ({
      url,
      score: Number.parseFloat(descriptor) || 1,
    }));
  return entries.sort((a, b) => b.score - a.score)[0]?.url || "";
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
  return candidates.map((candidate) => resolveArticleImageUrl(candidate || "", baseUrl)).find(Boolean) || "";
}

function openGraphHeroImage(doc, baseUrl, title) {
  const metaCandidates = [
    "meta[property='og:image']",
    "meta[name='twitter:image']",
    "meta[name='twitter:image:src']",
    "meta[itemprop='image']",
  ];
  const candidate = metaCandidates
    .map((selector) => doc.querySelector(selector)?.getAttribute("content"))
    .find(Boolean);
  const src = resolveArticleImageUrl(candidate || "", baseUrl);
  if (!src) return "";
  return `<figure class="article-hero"><img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="eager" decoding="async" /></figure>`;
}

function normalizeArticleImages(html, baseUrl, heroFallback = "") {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("img").forEach((image) => {
    const candidate = imageCandidate(image, baseUrl);

    if (!candidate) {
      image.remove();
      return;
    }

    image.setAttribute("src", candidate);
    image.setAttribute("loading", image.closest("figure") ? "eager" : "lazy");
    image.setAttribute("decoding", "async");
    image.removeAttribute("srcset");
    image.removeAttribute("data-srcset");
    image.removeAttribute("sizes");
    image.removeAttribute("data-src");
    image.removeAttribute("data-original");
    image.removeAttribute("data-lazy-src");
    image.removeAttribute("data-image");
  });
  if (!container.querySelector("img") && heroFallback) container.insertAdjacentHTML("afterbegin", heroFallback);
  return container.innerHTML;
}

function sanitizeArticleHtml(html, baseUrl, heroFallback = "") {
  return DOMPurify.sanitize(normalizeArticleImages(html, baseUrl, heroFallback), {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["figure", "figcaption", "picture", "source"],
    ADD_ATTR: ["src", "alt", "title", "width", "height", "loading", "decoding"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button", "svg"],
    FORBID_ATTR: ["style"],
  });
}

function uniqueId() {
  return window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showToast(message, type = "neutral") {
  state.toast = { message, type };
  render();
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    state.toast = null;
    render();
  }, 3600);
}

function applySettings() {
  const root = document.documentElement;
  root.dataset.theme = state.settings.theme;
  root.dataset.font = state.settings.font;
  root.style.setProperty("--reader-size", `${state.settings.fontSize}px`);
  root.classList.toggle("dark", state.settings.theme === "dark");
}

async function persistSettings() {
  applySettings();
  await storage.set(KEYS.settings, state.settings);
  log("settings.updated", state.settings);
  render();
}

async function saveArticle(article) {
  const withoutDuplicate = state.articles.filter((saved) => saved.url !== article.url);
  state.articles = [article, ...withoutDuplicate].slice(0, LIMITS.articles);
  await storage.set(KEYS.articles, state.articles);
  log("article.saved", { source: article.source, title: article.title.slice(0, 80) });
}

async function fetchRawHtml(url) {
  if (Capacitor.isNativePlatform()) {
    log("fetch.native.start", safeUrlForLog(url));
    const response = await CapacitorHttp.get({ url, responseType: "text", connectTimeout: 30000, readTimeout: 30000 });
    if (response.status < 200 || response.status >= 400) {
      throw new Error(`Native request returned HTTP ${response.status}`);
    }
    return typeof response.data === "string" ? response.data : String(response.data || "");
  }

  log("fetch.web.start", `${safeUrlForLog(url)} · browser fallback`);
  const response = await fetch(url, { headers: { Accept: "text/html,application/xhtml+xml" } });
  if (!response.ok) throw new Error(`Browser request returned HTTP ${response.status}`);
  return response.text();
}

async function extractArticle(url) {
  const rawHtml = await fetchRawHtml(url);
  log("extract.parse.start", `${rawHtml.length.toLocaleString()} bytes received`);
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  const parsed = new Readability(doc, { keepClasses: false, charThreshold: 140 }).parse();
  if (!parsed?.content || !parsed?.title) throw new Error("Readability could not identify a full article in this page.");

  const heroFallback = openGraphHeroImage(doc, url, parsed.title.trim());
  const content = sanitizeArticleHtml(parsed.content, url, heroFallback);
  const text = stripHtml(content);
  if (text.length < 120) throw new Error("The extracted text was too short to save as an article.");

  const source = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "Saved page";
    }
  })();

  const article = {
    id: uniqueId(),
    url,
    title: parsed.title.trim(),
    byline: parsed.byline?.trim() || source,
    source,
    content,
    excerpt: parsed.excerpt?.trim() || text.slice(0, 220),
    readingMinutes: minutesFor(text),
    dateAdded: new Date().toISOString(),
  };
  const imageCount = new DOMParser().parseFromString(content, "text/html").images.length;
  log("extract.images.prepared", `${imageCount} image${imageCount === 1 ? "" : "s"} ready`);
  log("extract.parse.success", `${article.readingMinutes} min · ${text.length.toLocaleString()} chars`);
  return article;
}

function icon(name, size = 18) {
  const attrs = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
  const paths = {
    plus: "<path d=\"M12 5v14M5 12h14\"/>",
    arrowLeft: "<path d=\"M19 12H5M12 19l-7-7 7-7\"/>",
    settings: "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56v.08h-3v-.08a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.56-1.03h-.08v-3h.08A1.7 1.7 0 0 0 7 9.94a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06A1.7 1.7 0 0 0 10.66 6a1.7 1.7 0 0 0 1.03-1.56v-.08h3v.08A1.7 1.7 0 0 0 15.72 6a1.7 1.7 0 0 0 1.88-.34l.06-.06L19.78 7.7l-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.08v3h-.08A1.7 1.7 0 0 0 19.4 15Z\"/>",
    bookmark: "<path d=\"M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5V22l-6-3.5L6 22V4.5Z\"/>",
    copy: "<rect x=\"9\" y=\"9\" width=\"11\" height=\"11\" rx=\"1\"/><path d=\"M5 15V5a1 1 0 0 1 1-1h10\"/>",
    book: "<path d=\"M4.5 5.5A2.5 2.5 0 0 1 7 3h4v16H7a2.5 2.5 0 0 0-2.5 2V5.5ZM19.5 5.5A2.5 2.5 0 0 0 17 3h-4v16h4a2.5 2.5 0 0 1 2.5 2V5.5Z\"/>",
    terminal: "<path d=\"m5 7 4 5-4 5M12 17h7\"/>",
    mark: "<path d=\"M4 4.5h6.15A3.85 3.85 0 0 1 14 8.35V20H7.85A3.85 3.85 0 0 0 4 23V4.5Z\"/><path d=\"M20 4.5h-6.15A3.85 3.85 0 0 0 10 8.35V20h6.15A3.85 3.85 0 0 1 20 23V4.5Z\"/>",
    diagnostic: "<path d=\"M6 5h12M6 12h8M6 19h12\"/><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"1\"/><circle cx=\"16\" cy=\"12\" r=\"1\" fill=\"currentColor\" stroke=\"none\"/>",
    sun: "<circle cx=\"12\" cy=\"12\" r=\"3.25\"/><path d=\"M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41\"/>",
    moon: "<path d=\"M20.6 14.4A8.8 8.8 0 0 1 9.6 3.4 8.8 8.8 0 1 0 20.6 14.4Z\"/>",
    chevron: "<path d=\"m9 18 6-6-6-6\"/>",
    external: "<path d=\"M14 5h5v5M19 5l-8 8\"/><path d=\"M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4\"/>",
  };
  return `<svg ${attrs}>${paths[name] || ""}</svg>`;
}

function logoMarkup(compact = false) {
  return `<div class="brand ${compact ? "brand--compact" : ""}" aria-label="whitemint reader">
    <span class="brand__mark" aria-hidden="true">${icon("mark", 30)}</span>
    ${compact ? "" : "<span class=\"brand__name\">whitemint</span>"}
  </div>`;
}

function tabMarkup() {
  return `<nav class="section-tabs" aria-label="Primary navigation">
    <button class="section-tab ${state.activeTab === "library" ? "is-active" : ""}" data-action="show-library">${icon("book", 15)}<span>Reader</span></button>
    <button class="section-tab ${state.activeTab === "debug" ? "is-active" : ""}" data-action="show-debug">${icon("terminal", 15)}<span>Debug</span>${state.logs.length ? `<b>${state.logs.length}</b>` : ""}</button>
  </nav>`;
}

function emptyLibraryMarkup() {
  return `<section class="empty-state" aria-labelledby="empty-title">
    <div class="empty-state__index"><span>Index / 00</span><span>Archive capacity 50</span></div>
    <span class="empty-state__mark" aria-hidden="true">${icon("mark", 60)}</span>
    <p class="eyebrow">Your reading shelf</p>
    <h2 id="empty-title">Nothing saved yet.</h2>
    <p>Paste a direct article link above. whitemint will keep only the words worth returning to.</p>
  </section>`;
}

function articleListMarkup() {
  if (!state.articles.length) return emptyLibraryMarkup();
  return `<section class="article-list" aria-label="Saved articles">
    <div class="list-label"><span>Saved reading</span><span>${state.articles.length} / ${LIMITS.articles}</span></div>
    ${state.articles
      .map(
        (article, index) => `<button class="article-item" data-action="open-article" data-id="${article.id}">
          <span class="article-item__number">${String(index + 1).padStart(2, "0")}</span>
          <span class="article-item__content">
            <span class="article-item__title">${escapeHtml(article.title)}</span>
            <span class="article-item__meta"><span>${escapeHtml(article.source)}</span><i></i><span>${article.readingMinutes} min</span><i></i><span>${formatDate(article.dateAdded)}</span></span>
          </span>
          <span class="article-item__arrow">${icon("chevron", 15)}</span>
        </button>`,
      )
      .join("")}
  </section>`;
}

function libraryMarkup() {
  const busy = state.busy ? "is-busy" : "";
  return `<main class="screen screen--library">
    <header class="app-header">
      ${logoMarkup()}
      <div class="app-header__aside"><span class="status-dot"></span><span>Private archive</span></div>
    </header>
    ${tabMarkup()}
    <section class="capture" aria-labelledby="capture-label">
      <p class="eyebrow" id="capture-label">Add an article</p>
      <form class="capture__form" id="capture-form">
        <label class="sr-only" for="article-url">Article URL</label>
        <input id="article-url" name="article-url" type="url" autocomplete="url" placeholder="Paste an article URL…" ${state.busy ? "disabled" : ""} />
        <button class="icon-button capture__submit ${busy}" type="submit" aria-label="Extract and save article" ${state.busy ? "disabled" : ""}>
          ${state.busy ? "<span class=\"spinner\"></span>" : icon("plus", 19)}
        </button>
      </form>
      <p class="capture__note">In Android, pages are retrieved by the native networking layer before cleaning.</p>
    </section>
    ${articleListMarkup()}
  </main>`;
}

function debugMarkup() {
  const nativeStatus = Capacitor.isNativePlatform() ? "Android native transport active" : "Browser preview · native transport activates in APK";
  const copyLabel = state.logs.length ? "Copy diagnostic log" : "Copy blank diagnostic log";
  return `<main class="screen screen--debug">
    <header class="app-header">
      ${logoMarkup()}
      <button class="tiny-button" data-action="clear-logs" ${state.logs.length ? "" : "disabled"}>Clear</button>
    </header>
    ${tabMarkup()}
    <section class="debug-intro">
      <span class="debug-intro__mark" aria-hidden="true">${icon("diagnostic", 47)}</span>
      <div>
        <p class="eyebrow">Diagnostic export</p>
        <h1>Keep the signal clear.</h1>
        <p>Copy this log and paste it here with the page URL if an article will not save.</p>
      </div>
    </section>
    <section class="diagnostic-card" aria-label="Runtime status">
      <div><span class="diagnostic-card__label">Transport</span><strong>${escapeHtml(nativeStatus)}</strong></div>
      <div><span class="diagnostic-card__label">Saved pages</span><strong>${state.articles.length} of ${LIMITS.articles}</strong></div>
      <div><span class="diagnostic-card__label">App store</span><strong>Device preferences + local backup</strong></div>
    </section>
    <div class="debug-actions">
      <button class="copy-button" data-action="copy-logs">${icon("copy", 17)}<span>${copyLabel}</span></button>
      <span>${state.logs.length} event${state.logs.length === 1 ? "" : "s"}</span>
    </div>
    <section class="log-shell" aria-live="polite">
      ${
        state.logs.length
          ? state.logs
              .map(
                (entry) => `<article class="log-entry"><time>${formatClock(entry.time)}</time><div><strong>${escapeHtml(entry.event)}</strong><p>${escapeHtml(entry.detail || "—")}</p></div></article>`,
              )
              .join("")
          : `<div class="log-empty"><span>${icon("terminal", 20)}</span><p>No events yet. The app will record extraction, storage, and settings events here.</p></div>`
      }
    </section>
  </main>`;
}

function readerMarkup() {
  const article = state.article;
  if (!article) return libraryMarkup();
  return `<main class="reader-view">
    <header class="reader-toolbar">
      <button class="toolbar-button" data-action="back-library" aria-label="Back to saved articles">${icon("arrowLeft", 20)}</button>
      <div class="reader-toolbar__identity">${logoMarkup(true)}<span>Reading view</span></div>
      <div class="reader-toolbar__actions">
        <button class="toolbar-button" data-action="open-settings" aria-label="Reading settings">${icon("settings", 18)}</button>
        <button class="toolbar-button" data-action="copy-source" aria-label="Copy source link">${icon("bookmark", 18)}</button>
      </div>
    </header>
    <article class="article-reading" data-font="${state.settings.font}">
      <p class="article-reading__source">${escapeHtml(article.source)}</p>
      <h1>${escapeHtml(article.title)}</h1>
      <div class="article-reading__meta"><span>${escapeHtml(article.byline)}</span><i></i><span>${article.readingMinutes} min read</span><i></i><span>${formatDate(article.dateAdded)}</span></div>
      <div class="article-reading__rule"></div>
      <div class="article-reading__body">${article.content}</div>
      <footer class="article-reading__footer"><span>Saved in whitemint</span><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">Open source ${icon("external", 14)}</a></footer>
    </article>
  </main>${settingsMarkup()}`;
}

function fontOptionsMarkup() {
  return FONTS
    .map(
      (font) => `<button class="setting-choice font-choice ${state.settings.font === font.id ? "is-active" : ""}" data-action="set-font" data-font="${font.id}" style="--choice-font:${font.family}"><span>Aa</span><small>${font.label}</small></button>`,
    )
    .join("");
}

function settingsMarkup() {
  if (!state.settingsOpen) return "";
  return `<div class="sheet-backdrop" data-action="close-settings" aria-hidden="true"></div>
  <section class="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <div class="sheet-handle"></div>
    <header class="sheet-header"><div><p class="eyebrow">Reading preferences</p><h2 id="settings-title">Set the page your way.</h2></div><button class="tiny-button" data-action="close-settings">Done</button></header>
    <div class="settings-section"><p class="setting-label">Typeface</p><div class="choice-grid choice-grid--fonts">${fontOptionsMarkup()}</div><p class="setting-hint">Choose a typeface directly. Your choice is saved for every article.</p></div>
    <div class="settings-section"><div class="setting-label-row"><p class="setting-label">Size</p><span>${state.settings.fontSize}px</span></div><div class="type-scale-control"><button class="type-scale-button" data-action="change-size" data-delta="-1" aria-label="Decrease reading size" ${state.settings.fontSize <= 14 ? "disabled" : ""}>A−</button><p>Adjust reading size</p><button class="type-scale-button" data-action="change-size" data-delta="1" aria-label="Increase reading size" ${state.settings.fontSize >= 22 ? "disabled" : ""}>A+</button></div></div>
    <div class="settings-section"><p class="setting-label">Theme</p><div class="choice-grid choice-grid--two"><button class="setting-choice theme-choice ${state.settings.theme === "light" ? "is-active" : ""}" data-action="set-theme" data-theme="light">${icon("sun", 16)}<span>Light</span></button><button class="setting-choice theme-choice ${state.settings.theme === "dark" ? "is-active" : ""}" data-action="set-theme" data-theme="dark">${icon("moon", 16)}<span>Dark</span></button></div></div>
  </section>`;
}

function toastMarkup() {
  if (!state.toast) return "";
  return `<div class="toast toast--${state.toast.type}" role="status"><span>${state.toast.type === "error" ? "!" : "✓"}</span><p>${escapeHtml(state.toast.message)}</p><button data-action="dismiss-toast" aria-label="Dismiss message">×</button></div>`;
}

function render() {
  applySettings();
  const root = document.querySelector("#root");
  const contents = state.article ? readerMarkup() : state.activeTab === "debug" ? debugMarkup() : libraryMarkup();
  root.innerHTML = `<div class="app-shell">${contents}${toastMarkup()}</div>`;
}

async function handleExtract(form) {
  const formData = new FormData(form);
  const url = String(formData.get("article-url") || "").trim();
  let checkedUrl;
  try {
    checkedUrl = new URL(url);
    if (!/^https?:$/.test(checkedUrl.protocol)) throw new Error("Only HTTP and HTTPS URLs can be read.");
  } catch (error) {
    const message = error.message === "Only HTTP and HTTPS URLs can be read." ? error.message : "Paste a complete article URL first.";
    log("fetch.rejected", message);
    showToast(message, "error");
    return;
  }

  state.busy = true;
  render();
  try {
    const article = await extractArticle(checkedUrl.toString());
    await saveArticle(article);
    state.article = article;
    showToast("Article saved to your reading shelf.", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown extraction error";
    log("fetch.failed", `${safeUrlForLog(url)} · ${message}`);
    showToast("Couldn’t extract this article. Copy the diagnostic log if you want help.", "error");
  } finally {
    state.busy = false;
    render();
  }
}

function buildLogExport() {
  const summary = {
    app: "whitemint",
    exportedAt: new Date().toISOString(),
    platform: Capacitor.getPlatform(),
    nativeTransport: Capacitor.isNativePlatform(),
    savedArticleCount: state.articles.length,
    settings: state.settings,
    events: state.logs,
  };
  return `WHITEMINT DIAGNOSTIC LOG\n${"=".repeat(27)}\n${JSON.stringify(summary, null, 2)}`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

async function handleAction(target) {
  const action = target.dataset.action;
  if (!action) return;

  if (action === "show-library") {
    state.activeTab = "library";
    state.article = null;
    render();
    return;
  }
  if (action === "show-debug") {
    state.activeTab = "debug";
    state.article = null;
    log("debug.opened", "User opened diagnostics");
    render();
    return;
  }
  if (action === "open-article") {
    state.article = state.articles.find((article) => article.id === target.dataset.id) || null;
    if (state.article) log("article.opened", state.article.title.slice(0, 80));
    render();
    return;
  }
  if (action === "back-library") {
    state.article = null;
    state.activeTab = "library";
    render();
    return;
  }
  if (action === "open-settings") {
    state.settingsOpen = true;
    render();
    return;
  }
  if (action === "close-settings") {
    state.settingsOpen = false;
    render();
    return;
  }
  if (action === "set-font") {
    state.settings.font = target.dataset.font;
    await persistSettings();
    return;
  }
  if (action === "change-size") {
    const delta = Number(target.dataset.delta);
    state.settings.fontSize = Math.min(22, Math.max(14, state.settings.fontSize + delta));
    await persistSettings();
    return;
  }
  if (action === "set-theme") {
    state.settings.theme = target.dataset.theme;
    await persistSettings();
    return;
  }
  if (action === "copy-source" && state.article) {
    try {
      await copyText(state.article.url);
      log("source.copied", safeUrlForLog(state.article.url));
      showToast("Source link copied.", "success");
    } catch (error) {
      log("source.copy.failed", error instanceof Error ? error.message : "Clipboard error");
      showToast("Couldn’t copy the source link.", "error");
    }
    return;
  }
  if (action === "copy-logs") {
    try {
      await copyText(buildLogExport());
      log("debug.copied", "Diagnostic log copied to clipboard");
      showToast("Diagnostic log copied. Paste it here with the link you tried.", "success");
    } catch (error) {
      log("debug.copy.failed", error instanceof Error ? error.message : "Clipboard error");
      showToast("Couldn’t copy the log. Try again after selecting it.", "error");
    }
    return;
  }
  if (action === "clear-logs") {
    state.logs = [];
    await storage.set(KEYS.logs, []);
    showToast("Diagnostic log cleared.", "neutral");
    return;
  }
  if (action === "dismiss-toast") {
    state.toast = null;
    render();
  }
}

document.addEventListener("submit", (event) => {
  if (event.target.matches("#capture-form")) {
    event.preventDefault();
    void handleExtract(event.target);
  }
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (target) void handleAction(target);
});

document.addEventListener(
  "load",
  (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.closest(".article-reading__body") || image.dataset.loaded) return;
    image.dataset.loaded = "true";
    const source = safeUrlForLog(image.currentSrc || image.src);
    if (state.loggedImageUrls.has(source)) return;
    state.loggedImageUrls.add(source);
    log("article.image.loaded", source);
  },
  true,
);

document.addEventListener(
  "error",
  (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.closest(".article-reading__body") || image.dataset.failed) return;
    image.dataset.failed = "true";
    const fallback = document.createElement("span");
    fallback.className = "article-image-fallback";
    fallback.textContent = image.alt ? `Image unavailable — ${image.alt}` : "Image unavailable";
    image.replaceWith(fallback);
    log("article.image.failed", safeUrlForLog(image.currentSrc || image.src));
  },
  true,
);

async function init() {
  [state.articles, state.settings, state.logs] = await Promise.all([
    storage.get(KEYS.articles, []),
    storage.get(KEYS.settings, DEFAULT_SETTINGS),
    storage.get(KEYS.logs, []),
  ]);
  state.settings = normalizeSettings(state.settings);
  state.articles = Array.isArray(state.articles)
    ? state.articles.slice(0, LIMITS.articles).map((article) => ({
        ...article,
        content: sanitizeArticleHtml(article.content || "", article.url || ""),
      }))
    : [];
  state.logs = Array.isArray(state.logs) ? state.logs.slice(0, LIMITS.logs) : [];
  log("app.ready", `${Capacitor.getPlatform()} · ${Capacitor.isNativePlatform() ? "native HTTP ready" : "web preview"}`);
  render();
}

void init();
