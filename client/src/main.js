/**
 * Editorial Signal design reminder: large reading-first typography, pale paper,
 * restrained lime highlights, and a complete theme system with calm focus mode.
 */
import "./styles.css";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Preferences } from "@capacitor/preferences";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Readability } from "@mozilla/readability";
import { extractArticle } from "./lib/fetcher.js";
import { extractSmryArticle, getSmryReaderUrl } from "./lib/smry.js";
import { sanitizeContent } from "./lib/article-sanitizer.js";
import { listArticles, migrateLegacyArticles, removeArticle, restoreArticle, saveArticle as storeSaveArticle, setArticleCollections } from "./lib/article-store.js";
import { initAdaptiveLayout } from "./lib/adaptive-layout.js";

// fetcher_fixed.js is intentionally kept as the supplied browser module; expose
// the installed Readability implementation for its existing global reference.
globalThis.Readability = Readability;

const KEYS = { articles: "whitemint:articles", settings: "whitemint:settings", logs: "whitemint:logs", collections: "whitemint:collections" };
const LIMITS = { logs: 160 };
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
  readerToolbarHidden: false,
  articles: [],
  collections: [],
  activeCollectionId: "all",
  collectionSheet: null,
  settings: { ...DEFAULT_SETTINGS },
  logs: [],
  busy: false,
  smryBusy: false,
  smryRequestToken: null,
  toast: null,
  pendingDelete: null,
  loggedImageUrls: new Set(),
};

const swipeGesture = { card: null, startX: 0, deltaX: 0, active: false, suppressClick: false };
let nativeStatusBarConfigured = false;
let nativeStatusBarStyle = "";
let nativeStatusBarColor = "";
let readerLastScrollTop = 0;

function normalizeSettings(saved = {}) {
  const legacySizes = { small: 16, normal: 18, large: 21 };
  const preferredSize = Number.isFinite(Number(saved.fontSize)) ? Number(saved.fontSize) : legacySizes[saved.size] || DEFAULT_SETTINGS.fontSize;
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    font: FONTS.some((font) => font.id === saved.font) ? saved.font : DEFAULT_SETTINGS.font,
    theme: ["light", "dark", "sepia"].includes(saved.theme) ? saved.theme : DEFAULT_SETTINGS.theme,
    fontSize: Math.min(26, Math.max(16, Math.round(preferredSize))),
  };
}

const escapeHtml = (value = "") => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const stripHtml = (value = "") => {
  const shell = document.createElement("div");
  shell.innerHTML = value;
  return (shell.textContent || shell.innerText || "").replace(/\s+/g, " ").trim();
};

function articleReadingTime(article) {
  const stored = Number(article?.readingMinutes);
  if (Number.isFinite(stored) && stored > 0) return `${Math.max(1, Math.round(stored))} min read`;
  const text = String(article?.textContent || stripHtml(article?.content || "")).trim();
  if (!text) return "";
  return `${Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 200))} min read`;
}

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

function sanitizeArticleHtml(html, baseUrl, heroFallback = "") {
  const cleanHtml = sanitizeContent(html, { baseUrl, heroFallback });
  if (!/^https?:\/\/(?:www\.)?thehindu\.com\//i.test(baseUrl || "")) return cleanHtml;
  const container = document.createElement("div");
  container.innerHTML = cleanHtml;
  container.querySelectorAll("p").forEach((paragraph) => {
    const text = (paragraph.textContent || "").replace(/\s+/g, " ").trim();
    if (/^(?:published|updated)\s*[-–:]\s+.+\b(?:19|20)\d{2}\b(?:.*\b(?:IST|GMT|UTC)\b)?$/i.test(text)) paragraph.remove();
  });
  return container.innerHTML;
}

async function syncNativeStatusBar() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (!nativeStatusBarConfigured) {
      await StatusBar.setOverlaysWebView({ overlay: true });
      nativeStatusBarConfigured = true;
    }
    const style = state.settings.theme === "dark" ? Style.Light : Style.Dark;
    if (nativeStatusBarStyle !== style) {
      await StatusBar.setStyle({ style });
      nativeStatusBarStyle = style;
    }
    const themeColor = { light: "#f4f4f1", dark: "#101011", sepia: "#e9d8b1" }[state.settings.theme] || "#f4f4f1";
    if (nativeStatusBarColor !== themeColor) {
      await StatusBar.setBackgroundColor({ color: themeColor });
      nativeStatusBarColor = themeColor;
    }
  } catch (error) {
    log("status-bar.sync.failed", error instanceof Error ? error.message : "Native status bar unavailable");
  }
}

function applySettings() {
  const root = document.documentElement;
  root.dataset.theme = state.settings.theme;
  root.style.setProperty("--reader-size", `${state.settings.fontSize}px`);
  const themeColor = { light: "#f4f4f1", dark: "#101011", sepia: "#e9d8b1" }[state.settings.theme] || "#f4f4f1";
  root.style.setProperty("--wm-system-bar-color", themeColor);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
  root.classList.toggle("dark", state.settings.theme === "dark");
  root.classList.toggle("sepia", state.settings.theme === "sepia");
  const article = document.querySelector(".article-reading");
  if (article) article.dataset.font = state.settings.font;
  void syncNativeStatusBar();
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

function syncReaderToolbar() {
  const toolbar = document.querySelector(".reader-toolbar");
  if (!toolbar) return;
  toolbar.classList.toggle("is-hidden", state.readerToolbarHidden);
  toolbar.setAttribute("aria-hidden", state.readerToolbarHidden ? "true" : "false");
  toolbar.querySelectorAll("button, a").forEach((control) => {
    if (state.readerToolbarHidden) {
      if (!control.hasAttribute("data-reader-tabindex")) control.setAttribute("data-reader-tabindex", control.getAttribute("tabindex") || "");
      control.setAttribute("tabindex", "-1");
    } else if (control.hasAttribute("data-reader-tabindex")) {
      const previous = control.getAttribute("data-reader-tabindex");
      if (previous) control.setAttribute("tabindex", previous);
      else control.removeAttribute("tabindex");
      control.removeAttribute("data-reader-tabindex");
    }
  });
}

function setReaderToolbarHidden(next) {
  const toolbar = document.querySelector(".reader-toolbar");
  if (next && toolbar?.contains(document.activeElement)) return;
  state.readerToolbarHidden = next;
  if (!next && state.focusMode) {
    state.focusMode = false;
    syncFocusMode();
  }
  syncReaderToolbar();
}

function handleReaderScroll(surface) {
  const scrollTop = Math.max(0, surface.scrollTop);
  const delta = scrollTop - readerLastScrollTop;
  const maxScrollTop = Math.max(0, surface.scrollHeight - surface.clientHeight);
  const nearArticleEnd = maxScrollTop - scrollTop <= 28;
  state.articleScrollTop = scrollTop;
  if (scrollTop <= 18 || nearArticleEnd) setReaderToolbarHidden(false);
  else if (delta > 5) setReaderToolbarHidden(true);
  else if (delta < -5) setReaderToolbarHidden(false);
  readerLastScrollTop = scrollTop;
}

function setFocusMode(next) {
  state.focusMode = next;
  syncFocusMode();
  setReaderToolbarHidden(next);
  const announce = document.querySelector(".focus-announce");
  if (announce) announce.textContent = next ? "Focus mode on. Tap the article again to show controls." : "Reader controls shown.";
}

function showToast(message, type = "neutral", action = "") {
  state.toast = { message, type, action };
  render();
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    state.toast = null;
    render();
  }, 3200);
}

async function saveArticle(article) {
  const saved = await storeSaveArticle(article);
  state.articles = await listArticles();
  const savedCollections = await storage.get(KEYS.collections, []);
  state.collections = Array.isArray(savedCollections) ? savedCollections.filter((item) => item?.id && item.id !== "inbox" && item.name?.trim()).map((item) => ({ id: item.id, name: item.name.trim().slice(0, 60) })) : [];
  log("article.saved", {
    source: article.source,
    title: article.title.slice(0, 80),
    strategy: article.strategy || "unknown",
    score: article.score ?? null,
    characters: article.textContent?.length || stripHtml(article.content || "").length,
    previewOnly: Boolean(article.previewOnly),
  });
  return state.articles.find((item) => item.id === saved.id) || saved;
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
    trash: "<path d=\"M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3\"/>",
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
    <button class="bottom-navigation__add" data-action="open-capture" aria-label="Add a reading">${icon("plus", 23)}<span>Add article</span></button>
    <button class="bottom-navigation__item ${state.activeTab === "debug" ? "is-active" : ""}" data-action="show-debug">${icon("terminal", 21)}<span>Debug</span></button>
  </nav>`;
}

function collectionMarkup() {
  const items = [{ id: "all", name: "All articles" }, ...state.collections];
  return '<div class="collection-bar" aria-label="Article collections">' + items.map((item) => '<button class="collection-chip ' + (state.activeCollectionId === item.id ? "is-active" : "") + '" data-action="set-collection" data-collection-id="' + escapeHtml(item.id) + '">' + escapeHtml(item.name) + '</button>').join("") + '</div><div class="collection-tools"><button class="collection-tool" data-action="manage-collections">Manage collections</button><button class="collection-tool collection-tool--new" data-action="open-new-collection">+ New</button></div>';
}
function collectionManagementMarkup() {
  const custom = state.collections;
  return '<div class="sheet-backdrop" data-action="close-collection-sheet"></div><section class="collection-sheet collection-sheet--manage" role="dialog" aria-modal="true"><div class="sheet-handle"></div><header class="sheet-header"><div><p>Collection management</p><h2>Organize your folders.</h2></div><button class="sheet-close" data-action="close-collection-sheet">Done</button></header><div class="collection-management-list">' + (custom.length ? custom.map((item) => '<div class="collection-management-row"><div><strong>' + escapeHtml(item.name) + '</strong><small>Articles stay saved if this collection is deleted.</small></div><div class="collection-management-actions"><input data-rename-collection value="' + escapeHtml(item.name) + '" maxlength="60" aria-label="Rename ' + escapeHtml(item.name) + '" /><button data-action="rename-collection" data-id="' + escapeHtml(item.id) + '">Rename</button><button class="collection-delete" data-action="delete-collection" data-id="' + escapeHtml(item.id) + '">Delete</button></div></div>').join("") : '<p class="collection-management-empty">No collections yet. Create one from the library.</p>') + '</div><p class="collection-management-note">Articles start unassigned. Choose one or more collections from an article’s Organize sheet whenever you want.</p></section>';
}
function organizeMarkup(article) { if (!state.collectionSheet || state.collectionSheet.type !== "organize") return ""; const selected = article.collectionIds || []; return '<div class="sheet-backdrop" data-action="close-collection-sheet"></div><section class="collection-sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div><header class="sheet-header"><div><p>Organize article</p><h2>Choose collections.</h2></div><button class="sheet-close" data-action="close-collection-sheet">Done</button></header><div class="collection-check-list">' + state.collections.map((item) => '<label><input type="checkbox" data-collection-check value="' + escapeHtml(item.id) + '" ' + (selected.includes(item.id) ? "checked" : "") + ' /><span>' + escapeHtml(item.name) + '</span></label>').join("") + '</div><button class="collection-save" data-action="save-article-collections">Save organization</button></section>'; }
function articleListMarkup() {
  const visibleArticles = state.activeCollectionId === "all" ? state.articles : state.articles.filter((article) => article.collectionIds?.includes(state.activeCollectionId));
  if (!visibleArticles.length) {
    const hasFilter = state.activeCollectionId !== "all";
    return `<section class="empty-library"><span class="empty-library__icon">${icon("archive", 31)}</span><div><h2>${hasFilter ? "Nothing here yet." : "Your brief begins here."}</h2><p>${hasFilter ? "Organize an article into this collection to see it here." : "Save an article that deserves a little more time."}</p></div></section>`;
  }
  return `<section class="saved-section" aria-label="Saved articles"><div class="section-heading"><div><p>${state.activeCollectionId === "all" ? "Saved articles" : escapeHtml(state.collections.find((item) => item.id === state.activeCollectionId)?.name || "Collection")}</p><h2>Worth a return.</h2></div></div><div class="article-card-list">${visibleArticles.map((article) => {
    const preview = articlePreviewImage(article);
    return `<div class="swipe-card" data-swipe-card data-id="${article.id}"><button class="swipe-card__delete" data-action="delete-article" data-id="${article.id}" aria-label="Delete ${escapeHtml(article.title)}">${icon("trash", 20)}<span>Delete</span></button><div class="article-card-row"><button class="article-card" data-action="open-article" data-id="${article.id}">${preview ? `<img class="article-card__image" src="${escapeHtml(preview)}" alt="" loading="lazy" />` : `<span class="article-card__image article-card__image--empty">${icon("book", 34)}</span>`}<span class="article-card__copy"><span class="article-card__source"><b>${escapeHtml(sourceInitials(article.source))}</b>${escapeHtml(article.source)}${article.previewOnly ? '<em class="article-card__status">Preview</em>' : ""}</span><strong>${escapeHtml(article.title)}</strong><small>${articleReadingTime(article)} · saved ${formatDate(article.dateAdded)}</small></span><span class="article-card__arrow">${icon("chevron", 20)}</span></button><button class="article-card__delete-desktop" data-action="delete-article" data-id="${article.id}" aria-label="Delete ${escapeHtml(article.title)}">${icon("trash", 16)}<span>Delete</span></button></div></div>`;
  }).join("")}</div></section>`;
}

function libraryMarkup() {
  return `<main class="dashboard-screen editorial-library">
    <header class="editorial-topbar editorial-topbar--clean"><span class="editorial-topbar__brand">whitemint</span><button class="theme-toggle" data-action="toggle-theme" aria-label="Switch to ${state.settings.theme === "light" ? "dark" : "light"} theme">${icon(state.settings.theme === "light" ? "moon" : "sun", 21)}</button></header>
    <section class="daily-brief daily-brief--clean"><h1>Your reading,<br /><span>worth keeping.</span></h1></section>
    ${collectionMarkup()}
    <button class="library-add-button" data-action="open-capture">${icon("plus", 19)}<span>Add article</span></button>
    ${articleListMarkup()}
  </main>${bottomNavigationMarkup()}${captureMarkup()}`;
}

function captureMarkup() {
  if (!state.captureOpen) return "";
  const busy = state.busy ? "is-busy" : "";
  return `<div class="capture-backdrop" data-action="close-capture" aria-hidden="true"></div><section class="capture-sheet" role="dialog" aria-modal="true" aria-labelledby="capture-title"><div class="sheet-handle"></div><header class="capture-sheet__header"><div><p>Add to your reading</p><h2 id="capture-title">Save an article.</h2></div><button class="sheet-close" data-action="close-capture">Close</button></header><p class="capture-sheet__intro">Paste one public article link, not a publisher homepage or section page. whitemint fetches directly first; incomplete results may be sent to smry.ai for a second extraction.</p><form class="capture__form capture__form--sheet" id="capture-form"><label class="sr-only" for="article-url">Article URL</label><input id="article-url" name="article-url" type="url" autocomplete="url" inputmode="url" placeholder="https://example.com/article" ${state.busy ? "disabled" : ""}/><button class="capture__submit ${busy}" type="submit" aria-label="Extract and save article" ${state.busy ? "disabled" : ""}>${state.busy ? "<span class=\"spinner\"></span>" : icon("arrowLeft", 21)}</button></form><p class="capture-sheet__note">Saved reading stays private on this device. Source URLs sent to smry.ai are handled under that service’s policies.</p></section>`;
}

function debugMarkup() {
  const nativeStatus = Capacitor.isNativePlatform() ? "Native Android transport" : "Browser preview";
  return `<main class="dashboard-screen debug-screen"><header class="dashboard-topbar"><button class="profile-tile" data-action="show-library" aria-label="Return to library">${icon("arrowLeft", 22)}</button>${logoMarkup()}<button class="topbar-action" data-action="clear-logs" ${state.logs.length ? "" : "disabled"}>Clear</button></header><section class="welcome-copy welcome-copy--compact"><p>Diagnostics</p><h1>Keep your<br /><em>signal clear.</em></h1></section><section class="debug-status-card"><span class="debug-status-card__icon">${icon("terminal", 23)}</span><div><strong>${escapeHtml(nativeStatus)}</strong><small>${state.articles.length} saved articles · ${state.logs.length} events</small></div></section><button class="copy-log-card" data-action="copy-logs">${icon("copy", 20)}<span><strong>Copy diagnostic log</strong><small>Paste it here whenever something feels off.</small></span>${icon("chevron", 18)}</button><section class="log-feed" aria-live="polite"><div class="section-heading"><div><p>Recent activity</p><h2>Event log</h2></div><span>${state.logs.length}</span></div>${state.logs.length ? state.logs.map((entry) => `<article class="log-row"><time>${formatClock(entry.time)}</time><div><strong>${escapeHtml(entry.event)}</strong><p>${escapeHtml(entry.detail || "—")}</p></div></article>`).join("") : "<p class=\"log-empty\">No events yet. Saving a reading will start the log.</p>"}</section></main>${bottomNavigationMarkup()}`;
}

function articleContentMarkup(content = "", baseUrl = "") {
  const template = document.createElement("template");
  template.innerHTML = sanitizeArticleHtml(content, baseUrl);
  const root = template.content;
  const contentNodes = [...root.querySelectorAll("p,h2,h3,h4,blockquote,ol,ul,pre,table")]
    .filter((node) => stripHtml(node.textContent || ""));
  const contextLabels = new Set(["synopsis", "credits", "summary", "in brief", "key points", "standfirst", "story so far"]);

  const contextGroup = contentNodes
    .slice(0, 8)
    .map((node) => {
      const label = stripHtml(node.textContent || "").toLowerCase();
      if (!contextLabels.has(label)) return null;
      const group = node.closest("[role='group']") || node.parentElement;
      if (!group || group === root || stripHtml(group.textContent || "").length > 1800) return null;
      const supportingText = [...group.querySelectorAll("p")]
        .filter((paragraph) => paragraph !== node)
        .some((paragraph) => stripHtml(paragraph.textContent || "").length >= 20);
      return supportingText ? group : null;
    })
    .find(Boolean);

  const isInsideFigure = (node) => Boolean(node.closest("figure"));
  const isAfter = (reference, node) => Boolean(reference.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING);
  const firstArticleNode = (reference = null) => contentNodes.find((node) => {
    if (isInsideFigure(node) || (reference && (reference.contains(node) || !isAfter(reference, node)))) return false;
    return true;
  });

  let bodyNode = firstArticleNode(contextGroup);
  if (contextGroup) contextGroup.classList.add("article-reading__synopsis");
  if (!bodyNode) bodyNode = firstArticleNode();
  const bodyParent = bodyNode?.parentNode;
  if (!bodyNode || !bodyParent) return template.innerHTML;

  bodyNode.classList.add("article-reading__body-content");
  const divider = document.createElement("div");
  divider.className = "article-reading__body-divider";
  divider.setAttribute("role", "separator");
  divider.setAttribute("aria-label", "Article begins");
  divider.innerHTML = "<span>Article</span>";
  bodyParent.insertBefore(divider, bodyNode);
  return template.innerHTML;
}

function readerMarkup() {
  const article = state.article;
  if (!article) return libraryMarkup();
  const previewNotice = article.previewOnly ? `<aside class="article-preview-notice" aria-label="Preview notice"><strong>Preview only — open in browser</strong><p>The publisher returned only a short public excerpt. You can try smry’s public extraction route, or continue at the original source.</p><div class="article-preview-notice__actions"><button data-action="retry-smry" ${state.smryBusy ? "disabled" : ""}>${state.smryBusy ? "Trying smry…" : "Try smry extraction"}</button><a href="${escapeHtml(getSmryReaderUrl(article.url))}" target="_blank" rel="noopener noreferrer">Open in smry ${icon("external", 15)}</a><a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">Open source ${icon("external", 15)}</a></div></aside>` : "";
  const content = articleContentMarkup(article.content, article.url);
  return `<main class="reader-view ${state.focusMode ? "is-focus" : ""}"><header class="reader-toolbar ${state.readerToolbarHidden ? "is-hidden" : ""}" aria-hidden="${state.readerToolbarHidden ? "true" : "false"}"><button class="reader-tool reader-tool--back" data-action="back-library" aria-label="Back to saved articles">${icon("arrowLeft", 22)}</button><div class="reader-toolbar__identity"><span>${escapeHtml(article.source)}</span></div><div class="reader-toolbar__actions"><button class="reader-tool" data-action="toggle-theme" aria-label="Toggle theme">${icon(state.settings.theme === "light" ? "moon" : "sun", 20)}</button><button class="reader-tool" data-action="open-settings" aria-label="Reading settings">${icon("settings", 20)}</button><button class="reader-tool" data-action="copy-source" aria-label="Copy source link">${icon("copy", 20)}</button></div></header><section class="reader-scroll-surface" aria-label="Article reader"><article class="article-reading" data-font="${state.settings.font}"><section class="article-reading__opening"><p class="article-reading__source"><span class="source-chip">${escapeHtml(sourceInitials(article.source))}</span>${escapeHtml(article.source)}</p><h1>${escapeHtml(article.title)}</h1><div class="article-reading__meta"><span>By ${escapeHtml(article.byline)}</span><i></i><span>${formatDate(article.dateAdded)} · ${articleReadingTime(article)}</span></div></section><div class="article-reading__body">${previewNotice}${content}</div><footer class="article-reading__footer" aria-label="Article actions"><button class="collection-organize-button" data-action="open-organize" data-id="${article.id}">Organize</button>${article.previewOnly ? "" : `<a class="article-reading__source-action" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">Open source ${icon("external", 15)}</a>`}</footer></article></section><p class="focus-announce" aria-live="polite"></p></main>${settingsMarkup()}`;
}

function fontOptionsMarkup() {
  return FONTS.map((font) => `<button class="font-chip ${state.settings.font === font.id ? "is-active" : ""}" data-action="set-font" data-font="${font.id}" style="--choice-font:${font.family}"><span>Aa</span><small>${font.label}</small></button>`).join("");
}

function settingsMarkup() {
  if (!state.settingsOpen) return "";
  return `<div class="sheet-backdrop" data-action="close-settings" aria-hidden="true"></div><section class="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div class="sheet-handle"></div><header class="sheet-header"><div><p>Reading preferences</p><h2 id="settings-title">Set the pace.</h2></div><button class="sheet-close" data-action="close-settings">Done</button></header><div class="settings-section"><p class="setting-label">Typeface</p><div class="font-chip-grid">${fontOptionsMarkup()}</div></div><div class="settings-section"><div class="setting-label-row"><p class="setting-label">Text size</p><span data-setting-size>${state.settings.fontSize}px</span></div><div class="type-scale-control"><button class="type-scale-button" data-action="change-size" data-delta="-1" aria-label="Decrease reading size" ${state.settings.fontSize <= 16 ? "disabled" : ""}>A−</button><p>Comfortable reading</p><button class="type-scale-button" data-action="change-size" data-delta="1" aria-label="Increase reading size" ${state.settings.fontSize >= 26 ? "disabled" : ""}>A+</button></div></div><div class="settings-section"><p class="setting-label">Theme</p><div class="theme-choice-grid"><button class="theme-choice ${state.settings.theme === "light" ? "is-active" : ""}" data-action="set-theme" data-theme="light">${icon("sun", 17)}<span>Light</span></button><button class="theme-choice ${state.settings.theme === "dark" ? "is-active" : ""}" data-action="set-theme" data-theme="dark">${icon("moon", 17)}<span>Dark</span></button><button class="theme-choice ${state.settings.theme === "sepia" ? "is-active" : ""}" data-action="set-theme" data-theme="sepia"><span class="theme-swatch theme-swatch--sepia"></span><span>Sepia</span></button></div></div></section>`;
}

function toastMarkup() {
  if (!state.toast) return "";
  return `<div class="toast toast--${state.toast.type}" role="status"><span>${state.toast.type === "error" ? "!" : "✓"}</span><p>${escapeHtml(state.toast.message)}</p>${state.toast.action ? `<button class="toast__action" data-action="${state.toast.action}">Undo</button>` : ""}<button data-action="dismiss-toast" aria-label="Dismiss message">×</button></div>`;
}

function render() {
  const root = document.querySelector("#root");
  root.innerHTML = `<div class="app-shell">${state.article ? readerMarkup() : state.activeTab === "debug" ? debugMarkup() : libraryMarkup()}${state.article || state.activeTab === "library" ? "" : captureMarkup()}${state.collectionSheet?.type === "manage" ? collectionManagementMarkup() : state.collectionSheet?.type === "new" ? `<div class="sheet-backdrop" data-action="close-collection-sheet"></div><section class="collection-sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div><header class="sheet-header"><div><p>New collection</p><h2>Name your folder.</h2></div><button class="sheet-close" data-action="close-collection-sheet">Done</button></header><label class="collection-name-label">Collection name<input data-collection-name maxlength="60" placeholder="e.g. Weekend reads" /></label><button class="collection-save" data-action="create-collection">Create collection</button></section>` : state.collectionSheet?.type === "organize" ? organizeMarkup(state.articles.find((item) => item.id === state.collectionSheet.articleId) || state.article) : ""}${toastMarkup()}</div>`;
  applySettings();
  if (state.article) requestAnimationFrame(() => {
    const surface = document.querySelector(".reader-scroll-surface");
    if (surface) {
      surface.scrollTop = state.articleScrollTop;
      readerLastScrollTop = state.articleScrollTop;
      syncReaderToolbar();
    }
  });
}

async function handleExtractUrl(url) {
  state.busy = true;
  render();
  try {
    const article = await extractArticle(url, { log });
    const savedArticle = await saveArticle(article);
    state.article = savedArticle;
    state.collectionSheet = { type: "organize", articleId: savedArticle.id };
    state.articleScrollTop = 0;
    readerLastScrollTop = 0;
    state.readerToolbarHidden = false;
    state.focusMode = false;
    state.captureOpen = false;
    showToast("Saved to your reading shelf.", "success");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown extraction error";
    log("fetch.failed", `${safeUrlForLog(url)} · ${errorMessage}`);
    showToast(error?.code === "section_page" ? "Paste an individual Economic Times article link, not its homepage or section page." : "Couldn’t save this article. Check the diagnostic log if it continues.", "error");
  } finally {
    state.busy = false;
    render();
  }
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
  await handleExtractUrl(checkedUrl.toString());
}

function invalidateSmryRequest() {
  state.smryRequestToken = null;
  state.smryBusy = false;
}

async function retryWithSmry() {
  if (!state.article || state.smryBusy) return;
  const sourceArticle = state.article;
  const requestToken = Symbol("smry-request");
  state.smryRequestToken = requestToken;
  state.smryBusy = true;
  render();
  try {
    const smryArticle = await extractSmryArticle(sourceArticle.url, sourceArticle);
    if (state.smryRequestToken !== requestToken || state.article?.id !== sourceArticle.id) return;
    const savedArticle = await saveArticle({ ...sourceArticle, ...smryArticle, id: sourceArticle.id, collectionIds: sourceArticle.collectionIds });
    if (state.smryRequestToken !== requestToken || state.article?.id !== sourceArticle.id) return;
    state.article = savedArticle;
    log("article.smry.loaded", `${smryArticle.provenance.blocks} blocks · ${smryArticle.textContent.length} characters`);
    showToast("Full article loaded via smry.", "success");
  } catch (error) {
    if (state.smryRequestToken !== requestToken || state.article?.id !== sourceArticle.id) return;
    log("article.smry.failed", error instanceof Error ? `${error.code || "error"} · ${error.message}` : "smry extraction failed");
    showToast("smry could not retrieve the full article. Try the source in your browser.", "error");
  } finally {
    if (state.smryRequestToken === requestToken) {
      state.smryRequestToken = null;
      state.smryBusy = false;
      render();
    }
  }
}

async function deleteArticle(id) {
  const index = state.articles.findIndex((article) => article.id === id);
  if (index < 0) return;
  const article = await removeArticle(id);
  state.articles = state.articles.filter((saved) => saved.id !== id);
  state.pendingDelete = { article, index };
  log("article.deleted", article.title.slice(0, 80));
  showToast("Article removed.", "neutral", "undo-delete");
}

async function undoDelete() {
  if (!state.pendingDelete) return;
  const { article, index } = state.pendingDelete;
  await restoreArticle(article);
  state.articles = await listArticles();
  state.pendingDelete = null;
  log("article.restored", article.title.slice(0, 80));
  showToast("Article restored.", "success");
}

function closeOpenSwipes(except = null) {
  document.querySelectorAll("[data-swipe-card].is-revealed").forEach((card) => {
    if (card !== except) card.classList.remove("is-revealed");
  });
}

function resetSwipeGesture() {
  if (!swipeGesture.card) return;
  swipeGesture.card.classList.remove("is-tracking");
  swipeGesture.card.style.removeProperty("--swipe-x");
  swipeGesture.card = null;
  swipeGesture.deltaX = 0;
  swipeGesture.active = false;
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
  if (state.collectionSheet) { state.collectionSheet = null; render(); return true; }
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
    invalidateSmryRequest();
    state.article = null;
    state.articleScrollTop = 0;
    readerLastScrollTop = 0;
    state.readerToolbarHidden = false;
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
    invalidateSmryRequest();
    state.activeTab = "library";
    state.article = null;
    state.captureOpen = false;
    state.focusMode = false;
    state.readerToolbarHidden = false;
    readerLastScrollTop = 0;
    render();
    return;
  }
  if (action === "show-debug") {
    invalidateSmryRequest();
    state.activeTab = "debug";
    state.article = null;
    state.captureOpen = false;
    state.focusMode = false;
    state.readerToolbarHidden = false;
    readerLastScrollTop = 0;
    log("debug.opened", "User opened diagnostics");
    render();
    return;
  }
  if (action === "open-capture") {
    state.captureOpen = true;
    state.settingsOpen = false;
    render();
    return;
  }
  if (action === "close-capture") {
    state.captureOpen = false;
    render();
    return;
  }
  if (action === "set-collection") { state.activeCollectionId = target.dataset.collectionId || "all"; render(); return; }
  if (action === "manage-collections") { state.collectionSheet = { type: "manage" }; render(); return; }
  if (action === "rename-collection") { const item = state.collections.find((entry) => entry.id === target.dataset.id); const input = target.closest(".collection-management-row")?.querySelector("[data-rename-collection]"); const name = input?.value.trim().slice(0, 60); if (!item || !name) return; if (state.collections.some((entry) => entry.id !== item.id && entry.name.toLowerCase() === name.toLowerCase())) { showToast("That collection already exists.", "error"); return; } item.name = name; await storage.set(KEYS.collections, state.collections); render(); return; }
  if (action === "delete-collection") { const id = target.dataset.id; const item = state.collections.find((entry) => entry.id === id); if (!item) return; if (!window.confirm(`Delete the “${item.name}” collection? Articles will be kept.`)) return; const articles = await listArticles(); await Promise.all(articles.filter((article) => article.collectionIds?.includes(id)).map((article) => setArticleCollections(article.id, article.collectionIds.filter((entry) => entry !== id)))); state.collections = state.collections.filter((entry) => entry.id !== id); if (state.activeCollectionId === id) state.activeCollectionId = "all"; state.articles = await listArticles(); if (state.article) state.article = state.articles.find((article) => article.id === state.article.id) || state.article; await storage.set(KEYS.collections, state.collections); state.collectionSheet = null; render(); return; }
  if (action === "open-new-collection") { state.collectionSheet = { type: "new" }; render(); requestAnimationFrame(() => document.querySelector("[data-collection-name]")?.focus()); return; }
  if (action === "close-collection-sheet") { state.collectionSheet = null; render(); return; }
  if (action === "create-collection") { const input = document.querySelector("[data-collection-name]"); const name = input?.value.trim().slice(0, 60); if (!name) return; if (state.collections.some((item) => item.name.toLowerCase() === name.toLowerCase())) { showToast("That collection already exists.", "error"); return; } state.collections = [...state.collections, { id: `collection-${Date.now()}`, name }]; await storage.set(KEYS.collections, state.collections); state.collectionSheet = null; render(); return; }
  if (action === "open-organize") { state.collectionSheet = { type: "organize", articleId: target.dataset.id }; render(); return; }
  if (action === "save-article-collections") { const article = state.articles.find((item) => item.id === state.collectionSheet?.articleId); if (article) { const ids = [...document.querySelectorAll("[data-collection-check]:checked")].map((input) => input.value); await setArticleCollections(article.id, ids); state.articles = await listArticles(); if (state.article?.id === article.id) state.article = state.articles.find((item) => item.id === article.id) || state.article; } state.collectionSheet = null; render(); return; }
  if (action === "open-article") {
    invalidateSmryRequest();
    state.article = state.articles.find((article) => article.id === target.dataset.id) || null;
    state.collectionSheet = null;
    state.articleScrollTop = 0;
    readerLastScrollTop = 0;
    state.readerToolbarHidden = false;
    state.focusMode = false;
    if (state.article) log("article.opened", state.article.title.slice(0, 80));
    render();
    return;
  }
  if (action === "delete-article") {
    await deleteArticle(target.dataset.id);
    return;
  }
  if (action === "undo-delete") {
    await undoDelete();
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
    state.settings.theme = state.settings.theme === "light" ? "dark" : state.settings.theme === "dark" ? "sepia" : "light";
    await persistSettings();
    return;
  }
  if (action === "retry-smry") {
    await retryWithSmry();
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

function keepFocusedFieldVisible(field) {
  const sheet = field?.closest(".capture-sheet, .collection-sheet");
  if (!sheet) return;
  window.setTimeout(() => {
    if (document.activeElement !== field) return;
    const targetTop = Math.max(0, field.offsetTop - Math.round(sheet.clientHeight * 0.42));
    sheet.scrollTo({ top: targetTop, behavior: "smooth" });
  }, 160);
}

document.addEventListener("focusin", (event) => {
  const field = event.target;
  if (field instanceof HTMLInputElement && field.matches("#article-url, [data-collection-name], [data-rename-collection]")) keepFocusedFieldVisible(field);
}, true);

window.visualViewport?.addEventListener("resize", () => {
  const field = document.activeElement;
  if (field instanceof HTMLInputElement && field.matches("#article-url, [data-collection-name], [data-rename-collection]")) keepFocusedFieldVisible(field);
});

document.addEventListener("submit", (event) => {
  if (event.target.matches("#capture-form")) {
    event.preventDefault();
    void handleExtract(event.target);
  }
});

document.addEventListener("scroll", (event) => {
  if (event.target instanceof Element && event.target.matches(".reader-scroll-surface")) handleReaderScroll(event.target);
}, true);

document.addEventListener("pointerdown", (event) => {
  const card = event.target.closest("[data-swipe-card]");
  if (!card || event.pointerType === "mouse" && event.button !== 0) return;
  closeOpenSwipes(card);
  swipeGesture.card = card;
  swipeGesture.startX = event.clientX;
  swipeGesture.deltaX = 0;
  swipeGesture.active = false;
});

document.addEventListener("pointermove", (event) => {
  if (!swipeGesture.card) return;
  const delta = event.clientX - swipeGesture.startX;
  if (delta >= -10) return;
  swipeGesture.active = true;
  swipeGesture.deltaX = Math.max(-124, delta);
  swipeGesture.card.classList.add("is-tracking");
  swipeGesture.card.style.setProperty("--swipe-x", `${swipeGesture.deltaX}px`);
});

document.addEventListener("pointerup", () => {
  if (!swipeGesture.card) return;
  const card = swipeGesture.card;
  const id = card.dataset.id;
  const shouldDelete = swipeGesture.deltaX <= -104;
  const shouldReveal = swipeGesture.deltaX <= -38;
  swipeGesture.suppressClick = swipeGesture.active;
  resetSwipeGesture();
  if (shouldDelete) {
    void deleteArticle(id);
    return;
  }
  if (shouldReveal) card.classList.add("is-revealed");
});

document.addEventListener("pointercancel", resetSwipeGesture);

document.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-action]");
  if (swipeGesture.suppressClick && actionTarget?.matches(".article-card")) {
    event.preventDefault();
    swipeGesture.suppressClick = false;
    return;
  }
  if (actionTarget) {
    void handleAction(actionTarget);
    return;
  }
  const readerSurface = event.target.closest(".reader-scroll-surface");
  const protectedTarget = event.target.closest("a, button, input, textarea, select, img, figure, figcaption");
  if (state.article && readerSurface && !protectedTarget) {
    const bounds = readerSurface.getBoundingClientRect();
    if (event.clientY <= bounds.top + 52) {
      setReaderToolbarHidden(false);
      return;
    }
    const isCenterTap = event.clientY > bounds.top + 52 && event.clientY < bounds.bottom - 44;
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
  const [legacyArticles, savedSettings, savedLogs, savedCollections] = await Promise.all([storage.get(KEYS.articles, []), storage.get(KEYS.settings, DEFAULT_SETTINGS), storage.get(KEYS.logs, []), storage.get(KEYS.collections, [])]);
  state.settings = normalizeSettings(savedSettings);
  state.collections = Array.isArray(savedCollections) ? savedCollections.filter((item) => item?.id && item.id !== "inbox" && item.name?.trim()).map((item) => ({ id: item.id, name: item.name.trim().slice(0, 60) })) : [];
  await storage.set(KEYS.collections, state.collections);
  state.logs = Array.isArray(savedLogs) ? savedLogs.slice(0, LIMITS.logs) : [];
  await migrateLegacyArticles(Array.isArray(legacyArticles) ? legacyArticles : [], log);
  state.articles = await listArticles();
  log("app.ready", `${Capacitor.getPlatform()} · ${Capacitor.isNativePlatform() ? "native HTTP ready" : "web preview"}`);
  await setupNativeBackHandling();
  render();
}

initAdaptiveLayout();
void init();
