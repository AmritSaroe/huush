/**
 * Editorial Signal design reminder: large reading-first typography, pale paper,
 * restrained lime highlights, and a complete theme system with calm focus mode.
 */
import "./styles.css";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Preferences } from "@capacitor/preferences";
import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";

const KEYS = { articles: "whitemint:articles", settings: "whitemint:settings", logs: "whitemint:logs" };
const LIMITS = { articles: 50, logs: 160 };
const DEFAULT_SETTINGS = { theme: "light", font: "sans", fontSize: 18 };
const FONTS = [
  { id: "sans", label: "Inter", family: "var(--font-sans)" },
  { id: "nunito", label: "Nunito", family: "var(--font-nunito)" },
  { id: "merriweather", label: "Merriweather", family: "var(--font-serif)" },
  { id: "source-serif", label: "Source Serif", family: "var(--font-serif-3)" },
  { id: "mono", label: "JetBrains", family: "var(--font-mono)" },
];

const state = {
  activeTab: "library",
  article: null,
  articleScrollTop: 0,
  settingsOpen: false,
  captureOpen: false,
  focusMode: false,
  articles: [],
  settings: { ...DEFAULT_SETTINGS },
  logs: [],
  busy: false,
  toast: null,
  loggedImageUrls: new Set(),
};

function normalizeSettings(saved = {}) {
  const legacySizes = { small: 16, normal: 18, large: 21 };
  const preferredSize = Number.isFinite(Number(saved.fontSize)) ? Number(saved.fontSize) : legacySizes[saved.size] || DEFAULT_SETTINGS.fontSize;
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    font: FONTS.some((font) => font.id === saved.font) ? saved.font : DEFAULT_SETTINGS.font,
    fontSize: Math.min(26, Math.max(16, Math.round(preferredSize))),
  };
}

const escapeHtml = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

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
      // Native Preferences still holds the setting when browser storage is unavailable.
    }
  },
};

function log(event, detail = "") {
  const entry = { time: new Date().toISOString(), event, detail: typeof detail === "string" ? detail : JSON.stringify(detail) };
  state.logs = [entry, ...state.logs].slice(0, LIMITS.logs);
  void storage.set(KEYS.logs, state.logs);
  if (state.activeTab === "debug" && !state.article) render();
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
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
  } catch {
    return "Saved";
  }
}

function formatClock(value) {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
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
  return value
    .split(",")
    .map((entry) => entry.trim().split(/\s+/))
    .filter(([url]) => Boolean(url))
    .map(([url, descriptor = "1x"]) => ({ url, score: Number.parseFloat(descriptor) || 1 }))
    .sort((a, b) => b.score - a.score)[0]?.url || "";
}

function imageCandidate(image, baseUrl) {
  const candidates = [image.getAttribute("data-src"), image.getAttribute("data-original"), image.getAttribute("data-lazy-src"), image.getAttribute("data-image"), bestSrcsetCandidate(image.getAttribute("data-srcset") || ""), bestSrcsetCandidate(image.getAttribute("srcset") || ""), image.getAttribute("src")];
  return candidates.map((candidate) => resolveArticleImageUrl(candidate || "", baseUrl)).find(Boolean) || "";
}

function openGraphHeroImage(doc, baseUrl, title) {
  const candidate = ["meta[property='og:image']", "meta[name='twitter:image']", "meta[name='twitter:image:src']", "meta[itemprop='image']"].map((selector) => doc.querySelector(selector)?.getAttribute("content")).find(Boolean);
  const src = resolveArticleImageUrl(candidate || "", baseUrl);
  return src ? `<figure class="article-hero"><img src="${escapeHtml(src)}" alt="${escapeHtml(title)}" loading="eager" decoding="async" /></figure>` : "";
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
    ["srcset", "data-srcset", "sizes", "data-src", "data-original", "data-lazy-src", "data-image"].forEach((attribute) => image.removeAttribute(attribute));
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

function applySettings() {
  const root = document.documentElement;
  root.dataset.theme = state.settings.theme;
  root.style.setProperty("--reader-size", `${state.settings.fontSize}px`);
  root.classList.toggle("dark", state.settings.theme === "dark");
  const article = document.querySelector(".article-reading");
  if (article) article.dataset.font = state.settings.font;
}

function syncPreferenceControls() {
  document.querySelectorAll("[data-action='set-font']").forEach((control) => control.classList.toggle("is-active", control.dataset.font === state.settings.font));
  document.querySelectorAll("[data-action='set-theme']").forEach((control) => control.classList.toggle("is-active", control.dataset.theme === state.settings.theme));
  document.querySelectorAll("[data-setting-size]").forEach((label) => {
    label.textContent = `${state.settings.fontSize}px`;
  });
  const decrease = document.querySelector("[data-action='change-size'][data-delta='-1']");
  const increase = document.querySelector("[data-action='change-size'][data-delta='1']");
  if (decrease) decrease.disabled = state.settings.fontSize <= 16;
  if (increase) increase.disabled = state.settings.fontSize >= 26;
}

async function persistSettings() {
  applySettings();
  syncPreferenceControls();
  await storage.set(KEYS.settings, state.settings);
  log("settings.updated", state.settings);
}

function syncFocusMode() {
  document.querySelector(".reader-view")?.classList.toggle("is-focus", state.focusMode);
}

function setFocusMode(next) {
  state.focusMode = next;
  syncFocusMode();
  const announce = document.querySelector(".focus-announce");
  if (announce) announce.textContent = next ? "Focus mode on. Tap the article again to show controls." : "Reader controls shown.";
}

function showToast(message, type = "neutral") {
  state.toast = { message, type };
  render();
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    state.toast = null;
    render();
  }, 3200);
}

async function saveArticle(article) {
  state.articles = [article, ...state.articles.filter((saved) => saved.url !== article.url)].slice(0, LIMITS.articles);
  await storage.set(KEYS.articles, state.articles);
  log("article.saved", { source: article.source, title: article.title.slice(0, 80) });
}

async function fetchRawHtml(url) {
  if (Capacitor.isNativePlatform()) {
    log("fetch.native.start", safeUrlForLog(url));
    const response = await CapacitorHttp.get({ url, responseType: "text", connectTimeout: 30000, readTimeout: 30000 });
    if (response.status < 200 || response.status >= 400) throw new Error(`Native request returned HTTP ${response.status}`);
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
  const content = sanitizeArticleHtml(parsed.content, url, openGraphHeroImage(doc, url, parsed.title.trim()));
  const text = stripHtml(content);
  if (text.length < 120) throw new Error("The extracted text was too short to save as an article.");
  const source = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "Saved page";
    }
  })();
  const article = { id: uniqueId(), url, title: parsed.title.trim(), byline: parsed.byline?.trim() || source, source, content, excerpt: parsed.excerpt?.trim() || text.slice(0, 220), readingMinutes: minutesFor(text), dateAdded: new Date().toISOString() };
  const imageCount = new DOMParser().parseFromString(content, "text/html").images.length;
  log("extract.images.prepared", `${imageCount} image${imageCount === 1 ? "" : "s"} ready`);
  log("extract.parse.success", `${article.readingMinutes} min · ${text.length.toLocaleString()} chars`);
  return article;
}

function icon(name, size = 20) {
  const attrs = `width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
  const paths = {
    plus: "<path d=\"M12 5v14M5 12h14\"/>",
    arrowLeft: "<path d=\"M19 12H5M12 19l-7-7 7-7\"/>",
    settings: "<circle cx=\"12\" cy=\"12\" r=\"3\"/><path d=\"M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56v.08h-3v-.08a1.7 1.7 0 0 0-1.03-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 15a1.7 1.7 0 0 0-1.56-1.03h-.08v-3h.08A1.7 1.7 0 0 0 7 9.94a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.12-2.12.06.06A1.7 1.7 0 0 0 10.66 6a1.7 1.7 0 0 0 1.03-1.56v-.08h3v.08A1.7 1.7 0 0 0 15.72 6a1.7 1.7 0 0 0 1.88-.34l.06-.06L19.78 7.7l-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.08v3h-.08A1.7 1.7 0 0 0 19.4 15Z\"/>",
    bookmark: "<path d=\"M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5V22l-6-3.5L6 22V4.5Z\"/>",
    copy: "<rect x=\"9\" y=\"9\" width=\"11\" height=\"11\" rx=\"2\"/><path d=\"M5 15V5a1 1 0 0 1 1-1h10\"/>",
    book: "<path d=\"M4.5 5.5A2.5 2.5 0 0 1 7 3h4v16H7a2.5 2.5 0 0 0-2.5 2V5.5ZM19.5 5.5A2.5 2.5 0 0 0 17 3h-4v16h4a2.5 2.5 0 0 1 2.5 2V5.5Z\"/>",
    terminal: "<path d=\"m5 7 4 5-4 5M12 17h7\"/>",
    mark: "<path d=\"M4 4.5h6.15A3.85 3.85 0 0 1 14 8.35V20H7.85A3.85 3.85 0 0 0 4 23V4.5Z\"/><path d=\"M20 4.5h-6.15A3.85 3.85 0 0 0 10 8.35V20h6.15A3.85 3.85 0 0 1 20 23V4.5Z\"/>",
    home: "<path d=\"m3 11 9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z\"/>",
    archive: "<path d=\"M4 6h16v14H4z\"/><path d=\"M3 3h18v3H3zM9 11h6\"/>",
    chevron: "<path d=\"m9 18 6-6-6-6\"/>",
    external: "<path d=\"M14 5h5v5M19 5l-8 8\"/><path d=\"M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4\"/>",
    sun: "<circle cx=\"12\" cy=\"12\" r=\"3.25\"/><path d=\"M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41\"/>",
    moon: "<path d=\"M20.6 14.4A8.8 8.8 0 0 1 9.6 3.4 8.8 8.8 0 1 0 20.6 14.4Z\"/>",
  };
  return `<svg ${attrs}>${paths[name] || ""}</svg>`;
}

function logoMarkup(compact = false) {
  return `<div class="brand ${compact ? "brand--compact" : ""}" aria-label="whitemint reader"><span class="brand__mark" aria-hidden="true">${icon("mark", compact ? 21 : 25)}</span>${compact ? "" : "<span class=\"brand__name\">whitemint</span>"}</div>`;
}

function articlePreviewImage(article) {
  const preview = document.createElement("div");
  preview.innerHTML = article.content || "";
  return preview.querySelector("img")?.getAttribute("src") || "";
}

function sourceInitials(source = "") {
  return source.replace(/^www\./, "").split(/[.\-]/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "WM";
}

function currentDayLabel() {
  return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date());
}

function bottomNavigationMarkup() {
  return `<nav class="bottom-navigation" aria-label="Primary navigation">
    <button class="bottom-navigation__item ${state.activeTab === "library" ? "is-active" : ""}" data-action="show-library">${icon("home", 21)}<span>Today</span></button>
    <button class="bottom-navigation__add" data-action="open-capture" aria-label="Add a reading">${icon("plus", 23)}</button>
    <button class="bottom-navigation__item ${state.activeTab === "debug" ? "is-active" : ""}" data-action="show-debug">${icon("terminal", 21)}<span>Debug</span></button>
  </nav>`;
}

function articleListMarkup() {
  if (!state.articles.length) {
    return `<section class="empty-library"><span class="empty-library__icon">${icon("archive", 31)}</span><div><h2>Your brief begins here.</h2><p>Save an article that deserves a little more time.</p></div></section>`;
  }
  return `<section class="saved-section" aria-label="Saved articles"><div class="section-heading"><div><p>Saved articles</p><h2>Worth a return.</h2></div></div><div class="article-card-list">${state.articles.map((article) => {
    const preview = articlePreviewImage(article);
    return `<button class="article-card" data-action="open-article" data-id="${article.id}">${preview ? `<img class="article-card__image" src="${escapeHtml(preview)}" alt="" loading="lazy" />` : `<span class="article-card__image article-card__image--empty">${icon("book", 34)}</span>`}<span class="article-card__copy"><span class="article-card__source"><b>${escapeHtml(sourceInitials(article.source))}</b>${escapeHtml(article.source)}</span><strong>${escapeHtml(article.title)}</strong><small>${article.readingMinutes} min read · saved ${formatDate(article.dateAdded)}</small></span><span class="article-card__arrow">${icon("chevron", 20)}</span></button>`;
  }).join("")}</div></section>`;
}

function libraryMarkup() {
  return `<main class="dashboard-screen editorial-library">
    <header class="editorial-topbar editorial-topbar--clean"><span class="editorial-topbar__brand">whitemint</span><span class="editorial-topbar__title">${currentDayLabel()}</span><button class="theme-toggle" data-action="toggle-theme" aria-label="Switch to ${state.settings.theme === "light" ? "dark" : "light"} theme">${icon(state.settings.theme === "light" ? "moon" : "sun", 21)}</button></header>
    <section class="daily-brief daily-brief--clean"><h1>Your reading,<br /><span>worth keeping.</span></h1></section>
    ${articleListMarkup()}
  </main>${bottomNavigationMarkup()}${captureMarkup()}`;
}

function captureMarkup() {
  if (!state.captureOpen) return "";
  const busy = state.busy ? "is-busy" : "";
  return `<div class="capture-backdrop" data-action="close-capture" aria-hidden="true"></div><section class="capture-sheet" role="dialog" aria-modal="true" aria-labelledby="capture-title"><div class="sheet-handle"></div><header class="capture-sheet__header"><div><p>Add to your reading</p><h2 id="capture-title">Save an article.</h2></div><button class="sheet-close" data-action="close-capture">Close</button></header><p class="capture-sheet__intro">Paste a public article link. whitemint will fetch and clean it on your device.</p><form class="capture__form capture__form--sheet" id="capture-form"><label class="sr-only" for="article-url">Article URL</label><input id="article-url" name="article-url" type="url" autocomplete="url" inputmode="url" placeholder="https://example.com/article" ${state.busy ? "disabled" : ""}/><button class="capture__submit ${busy}" type="submit" aria-label="Extract and save article" ${state.busy ? "disabled" : ""}>${state.busy ? "<span class=\"spinner\"></span>" : icon("arrowLeft", 21)}</button></form><p class="capture-sheet__note">Your saved reading stays private to this device.</p></section>`;
}

function debugMarkup() {
  const nativeStatus = Capacitor.isNativePlatform() ? "Native Android transport" : "Browser preview";
  return `<main class="dashboard-screen debug-screen"><header class="dashboard-topbar"><button class="profile-tile" data-action="show-library" aria-label="Return to library">${icon("arrowLeft", 22)}</button>${logoMarkup()}<button class="topbar-action" data-action="clear-logs" ${state.logs.length ? "" : "disabled"}>Clear</button></header><section class="welcome-copy welcome-copy--compact"><p>Diagnostics</p><h1>Keep your<br /><em>signal clear.</em></h1></section><section class="debug-status-card"><span class="debug-status-card__icon">${icon("terminal", 23)}</span><div><strong>${escapeHtml(nativeStatus)}</strong><small>${state.articles.length} saved articles · ${state.logs.length} events</small></div></section><button class="copy-log-card" data-action="copy-logs">${icon("copy", 20)}<span><strong>Copy diagnostic log</strong><small>Paste it here whenever something feels off.</small></span>${icon("chevron", 18)}</button><section class="log-feed" aria-live="polite"><div class="section-heading"><div><p>Recent activity</p><h2>Event log</h2></div><span>${state.logs.length}</span></div>${state.logs.length ? state.logs.map((entry) => `<article class="log-row"><time>${formatClock(entry.time)}</time><div><strong>${escapeHtml(entry.event)}</strong><p>${escapeHtml(entry.detail || "—")}</p></div></article>`).join("") : "<p class=\"log-empty\">No events yet. Saving a reading will start the log.</p>"}</section></main>${bottomNavigationMarkup()}`;
}

function readerMarkup() {
  const article = state.article;
  if (!article) return libraryMarkup();
  return `<main class="reader-view ${state.focusMode ? "is-focus" : ""}"><header class="reader-toolbar"><button class="reader-tool reader-tool--back" data-action="back-library" aria-label="Back to saved articles">${icon("arrowLeft", 22)}</button><div class="reader-toolbar__identity"><span>${escapeHtml(article.source)}</span></div><div class="reader-toolbar__actions"><button class="reader-tool" data-action="toggle-theme" aria-label="Toggle theme">${icon(state.settings.theme === "light" ? "moon" : "sun", 20)}</button><button class="reader-tool" data-action="open-settings" aria-label="Reading settings">${icon("settings", 20)}</button><button class="reader-tool" data-action="copy-source" aria-label="Copy source link">${icon("bookmark", 20)}</button></div></header><section class="reader-scroll-surface" aria-label="Article reader"><article class="article-reading" data-font="${state.settings.font}"><section class="article-reading__opening"><p class="article-reading__source"><span class="source-chip">${escapeHtml(sourceInitials(article.source))}</span>${escapeHtml(article.source)}</p><h1>${escapeHtml(article.title)}</h1><div class="article-reading__meta"><span>By ${escapeHtml(article.byline)}</span><i></i><span>${formatDate(article.dateAdded)} · ${article.readingMinutes} min read</span></div></section><div class="article-reading__body">${article.content}</div><footer class="article-reading__footer"><span>Saved in whitemint</span><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">Open source ${icon("external", 15)}</a></footer></article></section><p class="focus-announce" aria-live="polite"></p></main>${settingsMarkup()}`;
}

function fontOptionsMarkup() {
  return FONTS.map((font) => `<button class="font-chip ${state.settings.font === font.id ? "is-active" : ""}" data-action="set-font" data-font="${font.id}" style="--choice-font:${font.family}"><span>Aa</span><small>${font.label}</small></button>`).join("");
}

function settingsMarkup() {
  if (!state.settingsOpen) return "";
  return `<div class="sheet-backdrop" data-action="close-settings" aria-hidden="true"></div><section class="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div class="sheet-handle"></div><header class="sheet-header"><div><p>Reading preferences</p><h2 id="settings-title">Set the pace.</h2></div><button class="sheet-close" data-action="close-settings">Done</button></header><div class="settings-section"><p class="setting-label">Typeface</p><div class="font-chip-grid">${fontOptionsMarkup()}</div></div><div class="settings-section"><div class="setting-label-row"><p class="setting-label">Text size</p><span data-setting-size>${state.settings.fontSize}px</span></div><div class="type-scale-control"><button class="type-scale-button" data-action="change-size" data-delta="-1" aria-label="Decrease reading size" ${state.settings.fontSize <= 16 ? "disabled" : ""}>A−</button><p>Comfortable reading</p><button class="type-scale-button" data-action="change-size" data-delta="1" aria-label="Increase reading size" ${state.settings.fontSize >= 26 ? "disabled" : ""}>A+</button></div></div><div class="settings-section"><p class="setting-label">Theme</p><div class="theme-choice-grid"><button class="theme-choice ${state.settings.theme === "light" ? "is-active" : ""}" data-action="set-theme" data-theme="light">${icon("sun", 17)}<span>Light</span></button><button class="theme-choice ${state.settings.theme === "dark" ? "is-active" : ""}" data-action="set-theme" data-theme="dark">${icon("moon", 17)}<span>Dark</span></button></div></div></section>`;
}

function toastMarkup() {
  if (!state.toast) return "";
  return `<div class="toast toast--${state.toast.type}" role="status"><span>${state.toast.type === "error" ? "!" : "✓"}</span><p>${escapeHtml(state.toast.message)}</p><button data-action="dismiss-toast" aria-label="Dismiss message">×</button></div>`;
}

function render() {
  const root = document.querySelector("#root");
  root.innerHTML = `<div class="app-shell">${state.article ? readerMarkup() : state.activeTab === "debug" ? debugMarkup() : libraryMarkup()}${state.article || state.activeTab === "library" ? "" : captureMarkup()}${toastMarkup()}</div>`;
  applySettings();
  if (state.article) requestAnimationFrame(() => {
    const surface = document.querySelector(".reader-scroll-surface");
    if (surface) surface.scrollTop = state.articleScrollTop;
  });
}

async function handleExtract(form) {
  const url = String(new FormData(form).get("article-url") || "").trim();
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
    state.articleScrollTop = 0;
    state.focusMode = false;
    state.captureOpen = false;
    showToast("Saved to your reading shelf.", "success");
  } catch (error) {
    log("fetch.failed", `${safeUrlForLog(url)} · ${error instanceof Error ? error.message : "Unknown extraction error"}`);
    showToast("Couldn’t save this article. Check the diagnostic log if it continues.", "error");
  } finally {
    state.busy = false;
    render();
  }
}

function buildLogExport() {
  return `WHITEMINT DIAGNOSTIC LOG\n${"=".repeat(27)}\n${JSON.stringify({ app: "whitemint", exportedAt: new Date().toISOString(), platform: Capacitor.getPlatform(), nativeTransport: Capacitor.isNativePlatform(), savedArticleCount: state.articles.length, settings: state.settings, events: state.logs }, null, 2)}`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function navigateBack() {
  if (state.captureOpen) {
    state.captureOpen = false;
    render();
    return true;
  }
  if (state.settingsOpen) {
    state.settingsOpen = false;
    render();
    return true;
  }
  if (state.focusMode) {
    setFocusMode(false);
    return true;
  }
  if (state.article) {
    state.article = null;
    state.articleScrollTop = 0;
    state.activeTab = "library";
    render();
    return true;
  }
  if (state.activeTab !== "library") {
    state.activeTab = "library";
    render();
    return true;
  }
  return false;
}

async function handleAction(target) {
  const action = target.dataset.action;
  if (!action) return;
  if (action === "show-library") {
    state.activeTab = "library";
    state.article = null;
    state.captureOpen = false;
    state.focusMode = false;
    render();
    return;
  }
  if (action === "show-debug") {
    state.activeTab = "debug";
    state.article = null;
    state.captureOpen = false;
    state.focusMode = false;
    log("debug.opened", "User opened diagnostics");
    render();
    return;
  }
  if (action === "open-capture") {
    state.captureOpen = true;
    state.settingsOpen = false;
    render();
    requestAnimationFrame(() => document.querySelector("#article-url")?.focus());
    return;
  }
  if (action === "close-capture") {
    state.captureOpen = false;
    render();
    return;
  }
  if (action === "open-article") {
    state.article = state.articles.find((article) => article.id === target.dataset.id) || null;
    state.articleScrollTop = 0;
    state.focusMode = false;
    if (state.article) log("article.opened", state.article.title.slice(0, 80));
    render();
    return;
  }
  if (action === "back-library") return navigateBack();
  if (action === "open-settings") {
    state.focusMode = false;
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
    state.settings.fontSize = Math.min(26, Math.max(16, state.settings.fontSize + Number(target.dataset.delta)));
    await persistSettings();
    return;
  }
  if (action === "set-theme") {
    state.settings.theme = target.dataset.theme;
    await persistSettings();
    return;
  }
  if (action === "toggle-theme") {
    state.settings.theme = state.settings.theme === "light" ? "dark" : "light";
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
      showToast("Diagnostic log copied.", "success");
    } catch (error) {
      log("debug.copy.failed", error instanceof Error ? error.message : "Clipboard error");
      showToast("Couldn’t copy the log.", "error");
    }
    return;
  }
  if (action === "clear-logs") {
    state.logs = [];
    await storage.set(KEYS.logs, []);
    showToast("Diagnostic log cleared.");
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

document.addEventListener("scroll", (event) => {
  if (event.target instanceof Element && event.target.matches(".reader-scroll-surface")) state.articleScrollTop = event.target.scrollTop;
}, true);

document.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-action]");
  if (actionTarget) {
    void handleAction(actionTarget);
    return;
  }
  const readerSurface = event.target.closest(".reader-scroll-surface");
  const protectedTarget = event.target.closest("a, button, input, textarea, select, img, figure, figcaption");
  if (state.article && readerSurface && !protectedTarget) {
    const bounds = readerSurface.getBoundingClientRect();
    const isCenterTap = event.clientY > bounds.top + 44 && event.clientY < bounds.bottom - 44;
    if (isCenterTap) setFocusMode(!state.focusMode);
  }
});

document.addEventListener("load", (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.closest(".article-reading__body") || image.dataset.loaded) return;
  image.dataset.loaded = "true";
  const source = safeUrlForLog(image.currentSrc || image.src);
  if (state.loggedImageUrls.has(source)) return;
  state.loggedImageUrls.add(source);
  log("article.image.loaded", source);
}, true);

document.addEventListener("error", (event) => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement) || !image.closest(".article-reading__body") || image.dataset.failed) return;
  image.dataset.failed = "true";
  const fallback = document.createElement("span");
  fallback.className = "article-image-fallback";
  fallback.textContent = image.alt ? `Image unavailable — ${image.alt}` : "Image unavailable";
  image.replaceWith(fallback);
  log("article.image.failed", safeUrlForLog(image.currentSrc || image.src));
}, true);

async function setupNativeBackHandling() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await CapacitorApp.addListener("backButton", () => {
      if (!navigateBack()) CapacitorApp.exitApp();
    });
  } catch (error) {
    log("navigation.native.failed", error instanceof Error ? error.message : "Native back listener unavailable");
  }
}

async function init() {
  [state.articles, state.settings, state.logs] = await Promise.all([storage.get(KEYS.articles, []), storage.get(KEYS.settings, DEFAULT_SETTINGS), storage.get(KEYS.logs, [])]);
  state.settings = normalizeSettings(state.settings);
  state.articles = Array.isArray(state.articles) ? state.articles.slice(0, LIMITS.articles).map((article) => ({ ...article, content: sanitizeArticleHtml(article.content || "", article.url || "") })) : [];
  state.logs = Array.isArray(state.logs) ? state.logs.slice(0, LIMITS.logs) : [];
  log("app.ready", `${Capacitor.getPlatform()} · ${Capacitor.isNativePlatform() ? "native HTTP ready" : "web preview"}`);
  await setupNativeBackHandling();
  render();
}

void init();
