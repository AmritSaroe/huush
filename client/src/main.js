/**
 * Editorial Signal design reminder: large reading-first typography, pale paper,
 * restrained lime highlights, and a complete theme system with calm focus mode.
 */
import "./styles.css";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Share } from "@capacitor/share";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Preferences } from "@capacitor/preferences";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Readability } from "@mozilla/readability";
import { extractArticle } from "./lib/fetcher.js";
import { extractSmryArticle, getSmryReaderUrl } from "./lib/smry.js";
import { sanitizeContent } from "./lib/article-sanitizer.js";
import { listArticles, migrateLegacyArticles, removeArticle, restoreArticle, saveArticle as storeSaveArticle, setArticleCollections } from "./lib/article-store.js";
import { initAdaptiveLayout } from "./lib/adaptive-layout.js";
import logger, { APP_VERSION } from "./lib/logger.js";

// fetcher_fixed.js is intentionally kept as the supplied browser module; expose
// the installed Readability implementation for its existing global reference.
globalThis.Readability = Readability;

const KEYS = { articles: "whitemint:articles", settings: "whitemint:settings", collections: "whitemint:collections" };
const STORAGE_FLAGS = { developer: "dev_options_enabled" };
const DEFAULT_SETTINGS = { theme: "light", font: "inter", fontSize: 18, readerLineHeight: 1.6, readerTitleLineHeight: 1.2 };
const FONTS = [
  { id: "inter", label: "Inter", family: "var(--font-reading-inter)", bodyLineHeight: 1.6, titleLineHeight: 1.2, serif: false },
  { id: "source-serif-4", label: "Source Serif 4", family: "var(--font-reading-source-serif-4)", bodyLineHeight: 1.7, titleLineHeight: 1.25, serif: true },
  { id: "merriweather", label: "Merriweather", family: "var(--font-reading-merriweather)", bodyLineHeight: 1.75, titleLineHeight: 1.3, serif: true },
  { id: "literata", label: "Literata", family: "var(--font-reading-literata)", bodyLineHeight: 1.7, titleLineHeight: 1.25, serif: true },
];
const LEGACY_FONT_IDS = { sans: "inter", "source-serif": "source-serif-4" };
const fontLoadPromises = new Map();

function fontFamilyName(fontId) {
  return { inter: "Inter", "source-serif-4": "Source Serif 4", merriweather: "Merriweather", literata: "Literata" }[fontId] || "Inter";
}

function ensureFontLoaded(fontId, weight = 400, style = "normal") {
  if (!document.fonts?.load) return Promise.resolve();
  const key = `${fontId}:${weight}:${style}`;
  if (!fontLoadPromises.has(key)) {
    const family = fontFamilyName(fontId);
    fontLoadPromises.set(key, document.fonts.load(`${style} ${weight} 16px "${family}"`).catch(() => []));
  }
  return fontLoadPromises.get(key);
}

function ensureFontPickerFontsLoaded() {
  return Promise.all(FONTS.filter((font) => font.serif).flatMap((font) => [ensureFontLoaded(font.id), ensureFontLoaded(font.id, 600), ensureFontLoaded(font.id, 400, "italic")]));
}

function preloadReadingFonts() {
  const preload = () => void Promise.all(FONTS.filter((font) => font.serif).map((font) => ensureFontLoaded(font.id)));
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(preload, { timeout: 1200 });
  else window.setTimeout(preload, 240);
}

const state = {
  activeTab: "library",
  article: null,
  articleScrollTop: 0,
  settingsOpen: false,
  captureOpen: false,
  focusMode: false,
  readerToolbarHidden: false,
  articleProgress: 0,
  searchQuery: "",
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
  developerOptionsEnabled: false,
  developerLoggingEnabled: true,
  developerVerboseLogging: false,
  logViewerOpen: false,
  logViewerEvents: [],
  logViewerFilter: "all",
  logViewerSearch: "",
  expandedLogKey: "",
  confirmClear: false,
  viewTransition: "",
};

const swipeGesture = { card: null, startX: 0, deltaX: 0, active: false, suppressClick: false };
let nativeStatusBarConfigured = false;
let nativeStatusBarStyle = "";
let nativeStatusBarColor = "";
let lastStatusBarConfig = "";
let pendingStatusBarConfig = null;
let nativeStatusBarSyncPromise = null;
let settingsInteractionUnlockTimeout = 0;
let screenEnteredAt = Date.now();
let lastPauseAt = 0;
let searchLogTimeout = 0;
let settingsInteractionLocked = false;
let readerLastScrollTop = 0;
let fontSizeUpdateFrame = 0;
let lastPersistedFontSize = DEFAULT_SETTINGS.fontSize;
let sliderInteractionDirty = false;
let lastReaderScrollMilestone = 0;
let readerOpenedAt = 0;
let versionTapCount = 0;
let lastVersionTapAt = 0;
function normalizeSettings(saved = {}) {
  const legacySizes = { small: 16, normal: 18, large: 21 };
  const preferredSize = Number.isFinite(Number(saved.fontSize)) ? Number(saved.fontSize) : legacySizes[saved.size] || DEFAULT_SETTINGS.fontSize;
  const fontId = LEGACY_FONT_IDS[saved.font] || saved.font;
  const selectedFont = FONTS.find((font) => font.id === fontId) || FONTS[0];
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    font: selectedFont.id,
    theme: ["system", "light", "dark", "sepia"].includes(saved.theme) ? saved.theme : DEFAULT_SETTINGS.theme,
    fontSize: Math.min(24, Math.max(14, Math.round(preferredSize))),
    readerLineHeight: Number.isFinite(Number(saved.readerLineHeight)) ? Number(saved.readerLineHeight) : selectedFont.bodyLineHeight,
    readerTitleLineHeight: Number.isFinite(Number(saved.readerTitleLineHeight)) ? Number(saved.readerTitleLineHeight) : selectedFont.titleLineHeight,
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

function log(event, detail = {}, level = "info") {
  return logger.log(event, detail, level);
}

function currentScreenName() {
  if (state.logViewerOpen) return "developer-logs";
  if (state.article) return "reader";
  return state.activeTab;
}

function logScreenChange(to, trigger = "tap") {
  const from = document.documentElement.dataset.huushScreen || currentScreenName();
  if (from === to) return;
  const durationMs = Math.max(0, Date.now() - screenEnteredAt);
  logger.log("screen.time", { screen: from, durationMs });
  logger.log("navigate", { from, to, trigger });
  screenEnteredAt = Date.now();
  document.documentElement.dataset.huushScreen = to;
}

function logSettingsChanged(key, oldValue, newValue) {
  if (Object.is(oldValue, newValue)) return;
  logger.log("settings.changed", { key, oldValue, newValue });
}

function readLocalFlag(key, fallback = false) {
  try { return window.localStorage.getItem(key) === "true" || (window.localStorage.getItem(key) === null && fallback); } catch { return fallback; }
}

function logStorageStats() {
  const payload = JSON.stringify(state.articles);
  const estimate = navigator.storage?.estimate?.();
  if (estimate) {
    void estimate.then(({ quota = 0, usage = 0 }) => logger.log("storage.stats", { articles: state.articles.length, totalBytes: new Blob([payload]).size, freeBytes: Math.max(0, quota - usage) }));
  } else {
    logger.log("storage.stats", { articles: state.articles.length, totalBytes: new Blob([payload]).size, freeBytes: null });
  }
}

function logMemoryWarningIfAvailable() {
  const memory = performance.memory;
  if (memory && memory.usedJSHeapSize > memory.jsHeapSizeLimit * 0.8) logger.log("memory.warning", { usedJSHeapSize: memory.usedJSHeapSize }, "warn");
}

function logCapacitorError(plugin, method, error) {
  logger.log("error.capacitor", { plugin, method, error: error instanceof Error ? error.message : String(error) }, "error");
}

function beginSettingsInteraction() {
  if (settingsInteractionLocked) return false;
  settingsInteractionLocked = true;
  window.clearTimeout(settingsInteractionUnlockTimeout);
  settingsInteractionUnlockTimeout = window.setTimeout(() => { settingsInteractionLocked = false; }, 400);
  return true;
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

function syncNativeStatusBar() {
  if (!Capacitor.isNativePlatform()) return;
  const theme = effectiveTheme();
  const style = theme === "dark" ? Style.Dark : Style.Light;
  const themeColor = { light: "#FAFAF8", dark: "#121212", sepia: "#F5F0E6" }[theme] || "#FAFAF8";
  const configKey = `${theme}-${style}-${themeColor}`;
  if (lastStatusBarConfig === configKey) return;
  pendingStatusBarConfig = { theme, style, themeColor, configKey };
  if (nativeStatusBarSyncPromise) return;
  nativeStatusBarSyncPromise = (async () => {
    try {
      while (pendingStatusBarConfig) {
        const next = pendingStatusBarConfig;
        pendingStatusBarConfig = null;
        if (!nativeStatusBarConfigured) {
          await StatusBar.setOverlaysWebView({ overlay: false });
          nativeStatusBarConfigured = true;
        }
        if (nativeStatusBarStyle !== next.style) {
          await StatusBar.setStyle({ style: next.style });
          nativeStatusBarStyle = next.style;
        }
        if (nativeStatusBarColor !== next.themeColor) {
          await StatusBar.setBackgroundColor({ color: next.themeColor });
          nativeStatusBarColor = next.themeColor;
        }
        lastStatusBarConfig = next.configKey;
      }
    } catch (error) {
      lastStatusBarConfig = "";
      logCapacitorError("StatusBar", "sync", error);
    } finally {
      nativeStatusBarSyncPromise = null;
      if (pendingStatusBarConfig) syncNativeStatusBar();
    }
  })();
}

function effectiveTheme() {
  if (state.settings.theme !== "system") return state.settings.theme;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function themeLabel(theme = state.settings.theme) {
  return theme === "system" ? `System (${effectiveTheme() === "dark" ? "dark" : "light"})` : theme[0].toUpperCase() + theme.slice(1);
}

function nextThemePreference() {
  const cycle = ["light", "dark", "sepia", "system"];
  return cycle[(cycle.indexOf(state.settings.theme) + 1) % cycle.length] || "light";
}

function syncBrowserThemeColor(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const colors = { light: "#FAFAF8", dark: "#141414", sepia: "#F6F0E2" };
  meta.setAttribute("content", colors[theme] || colors.light);
}

function applySettings() {
  const root = document.documentElement;
  const theme = effectiveTheme();
  root.dataset.theme = theme;
  root.dataset.themePreference = state.settings.theme;
  root.dataset.readingFont = state.settings.font;
  syncBrowserThemeColor(theme);
  root.dataset.nativePlatform = Capacitor.isNativePlatform() ? "true" : "false";
  root.style.setProperty("--reader-size", `${state.settings.fontSize}px`);
  root.style.setProperty("--reader-line-height", String(state.settings.readerLineHeight || 1.6));
  root.style.setProperty("--reader-title-line-height", String(state.settings.readerTitleLineHeight || 1.2));
  const themeColor = { light: "#FAFAF8", dark: "#121212", sepia: "#F5F0E6" }[theme] || "#FAFAF8";
  root.style.setProperty("--wm-system-bar-color", themeColor);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColor);
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("sepia", theme === "sepia");
  const article = document.querySelector(".article-reading");
  if (article) {
    article.dataset.font = state.settings.font;
    article.dataset.readingFont = state.settings.font;
  }
  syncNativeStatusBar();
}

function syncPreferenceControls() {
  document.querySelectorAll("[data-action='set-font']").forEach((control) => {
    const active = control.dataset.font === state.settings.font;
    const font = FONTS.find((item) => item.id === control.dataset.font) || FONTS[0];
    control.classList.toggle("is-active", active);
    control.setAttribute("aria-checked", active ? "true" : "false");
    control.setAttribute("aria-label", `${font.label}${active ? ", selected" : ", double-tap to select"}`);
  });
  document.querySelectorAll("[data-action='set-theme']").forEach((control) => {
    const active = control.dataset.theme === state.settings.theme;
    control.classList.toggle("is-active", active);
    control.setAttribute("aria-checked", active ? "true" : "false");
  });
  document.querySelectorAll(".settings-control-hint").forEach((label) => { label.textContent = themeLabel(); });
  document.querySelectorAll(".reading-preview-card__heading > span").forEach((label) => { label.textContent = themeLabel(); });
  document.querySelectorAll("[data-setting-size]").forEach((label) => {
    label.textContent = `${state.settings.fontSize}px`;
  });
  document.querySelectorAll("[data-size-default]").forEach((label) => {
    label.hidden = state.settings.fontSize !== DEFAULT_SETTINGS.fontSize;
  });
  document.querySelectorAll(".font-size-ticks span").forEach((tick) => {
    tick.classList.toggle("is-current", Number(tick.textContent) === state.settings.fontSize);
  });
  document.querySelectorAll("[data-size-decrement]").forEach((control) => { control.disabled = state.settings.fontSize <= 14; });
  document.querySelectorAll("[data-size-increment]").forEach((control) => { control.disabled = state.settings.fontSize >= 24; });
  const range = document.querySelector("[data-font-size-range]");
  if (range) {
    range.value = String(state.settings.fontSize);
    range.setAttribute("aria-valuetext", `${state.settings.fontSize} pixels${state.settings.fontSize === DEFAULT_SETTINGS.fontSize ? ", default" : ""}`);
  }
  const preview = document.querySelector("[data-reading-preview]");
  const selectedFont = FONTS.find((font) => font.id === state.settings.font) || FONTS[0];
  if (preview) {
    preview.style.fontFamily = selectedFont.family;
    preview.style.fontSize = `${state.settings.fontSize}px`;
    preview.dataset.previewTheme = effectiveTheme();
  }
}

async function persistSettings() {
  applySettings();
  syncPreferenceControls();
  await storage.set(KEYS.settings, state.settings);
  lastPersistedFontSize = state.settings.fontSize;
}

function queueFontSizePreview(value) {
  sliderInteractionDirty = true;
  state.settings.fontSize = Math.min(24, Math.max(14, Number(value)));
  window.cancelAnimationFrame(fontSizeUpdateFrame);
  fontSizeUpdateFrame = window.requestAnimationFrame(() => {
    applySettings();
    syncPreferenceControls();
  });
}

function setViewTransition(direction = "forward") {
  state.viewTransition = direction;
}

function reducedMotionPreferred() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function closeVisibleSheet(onDone) {
  const sheet = document.querySelector(".settings-sheet, .capture-sheet, .collection-sheet");
  const backdrop = document.querySelector(".sheet-backdrop, .capture-backdrop");
  if (!sheet) {
    onDone();
    return;
  }
  sheet.classList.add("is-closing");
  backdrop?.classList.add("is-closing");
  window.setTimeout(onDone, reducedMotionPreferred() ? 0 : 260);
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
    state.articleProgress = maxScrollTop ? Math.min(100, Math.round((scrollTop / maxScrollTop) * 100)) : 0;
    document.querySelector(".reader-progress")?.style.setProperty("--progress", `${state.articleProgress}%`);
    const milestone = Math.min(4, Math.floor(state.articleProgress / 25));
    if (state.article && milestone > lastReaderScrollMilestone) {
      lastReaderScrollMilestone = milestone;
      logger.log("article.scroll", { id: state.article.id, depthPercent: milestone * 25, timeSpentMs: Math.max(0, Date.now() - readerOpenedAt) });
    }
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

function showToastInPlace(message, type = "neutral", action = "") {
  state.toast = { message, type, action };
  const shell = document.querySelector(".app-shell");
  const currentToast = shell?.querySelector(".toast");
  if (!shell) return showToast(message, type, action);
  const host = document.createElement("div");
  host.innerHTML = toastMarkup();
  const nextToast = host.firstElementChild;
  if (nextToast) {
    if (currentToast) currentToast.replaceWith(nextToast);
    else shell.append(nextToast);
  }
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    state.toast = null;
    document.querySelector(".toast")?.remove();
  }, 3200);
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
    search: "<circle cx=\"11\" cy=\"11\" r=\"6.5\"/><path d=\"m16 16 4.5 4.5\"/>",
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
  return `<div class="brand ${compact ? "brand--compact" : ""}" aria-label="huush reader"><span class="brand__name">huush</span></div>`;
}

function articlePreviewImage(article) {
  const preview = document.createElement("div");
  preview.innerHTML = article.content || "";
  return preview.querySelector("img")?.getAttribute("src") || "";
}


function currentDayLabel() {
  return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(new Date());
}

function bottomNavigationMarkup() {
  const current = (tab) => state.activeTab === tab ? 'aria-current="page"' : "";
  return `<nav class="bottom-navigation" aria-label="Primary navigation">
    <div class="bottom-navigation__brand">${logoMarkup(true)}<span>Quiet reading</span></div>
    <div class="bottom-navigation__items">
      <button class="bottom-navigation__item ${state.activeTab === "library" ? "is-active" : ""}" data-action="show-library" ${current("library")}>${icon("home", 21)}<span>Library</span></button>
      <button class="bottom-navigation__item ${state.activeTab === "tags" ? "is-active" : ""}" data-action="show-tags" ${current("tags")}>${icon("archive", 21)}<span>Tags</span></button>
      <button class="bottom-navigation__item ${state.activeTab === "settings" ? "is-active" : ""}" data-action="show-settings" ${current("settings")}>${icon("settings", 21)}<span>Settings</span></button>
    </div>
    <button class="bottom-navigation__add" type="button" data-action="open-capture">${icon("plus", 18)}<span>Add article</span></button>
    <p class="bottom-navigation__footer">huush — quiet the web</p>
  </nav>`;
}

function desktopWebNavMarkup() {
  const navItem = (tab, label, iconName) => `<button class="desktop-web-nav__link ${state.activeTab === tab ? "is-active" : ""}" type="button" data-action="show-${tab}" ${state.activeTab === tab ? 'aria-current="page"' : ""}>${icon(iconName, 17)}<span>${label}</span></button>`;
  return `<nav class="desktop-web-nav" aria-label="Primary navigation"><button class="desktop-web-nav__brand" type="button" data-action="show-library" aria-label="Go to Library"><span>huush</span><small>quiet reading</small></button><div class="desktop-web-nav__links">${navItem("library", "Library", "home")}${navItem("tags", "Collections", "archive")}${navItem("settings", "Settings", "settings")}</div><div class="desktop-web-nav__actions"><button class="desktop-web-nav__add" type="button" data-action="open-capture">${icon("plus", 17)}<span>Add article</span></button><button class="desktop-web-nav__theme" type="button" data-action="toggle-theme" aria-label="Switch to ${nextThemePreference()} theme">${icon(effectiveTheme() === "dark" ? "sun" : "moon", 17)}</button></div></nav>`;
}

function desktopLibraryHeroMarkup() {
  return `<section class="desktop-library-hero"><p class="desktop-library-hero__eyebrow">Your personal reading space</p><h1>Your reading,<br /><em>worth keeping.</em></h1><p class="desktop-library-hero__intro">Paste any article link. huush strips away the noise so you can read in peace.</p>${homeCaptureMarkup()}</section>`;
}

function collectionMarkup() {
  const countFor = (id) => id === "all" ? state.articles.length : state.articles.filter((article) => article.collectionIds?.includes(id)).length;
  const items = [{ id: "all", name: "All" }, ...state.collections];
  return '<section class="collections-section" aria-label="Collections"><div class="collections-heading"><h2>Collections</h2><button class="collection-tool collection-tool--new" data-action="open-new-collection">+ New</button></div><div class="collection-bar" aria-label="Article collections">' + items.map((item) => '<button class="collection-chip ' + (state.activeCollectionId === item.id ? "is-active" : "") + '" data-action="set-collection" data-collection-id="' + escapeHtml(item.id) + '">' + escapeHtml(item.name) + (item.id === "all" || countFor(item.id) ? ' · ' + countFor(item.id) : '') + '</button>').join("") + '</div></section>';
}
function collectionManagementMarkup() {
  const custom = state.collections;
  return '<div class="sheet-backdrop" data-action="close-collection-sheet"></div><section class="collection-sheet collection-sheet--manage" role="dialog" aria-modal="true"><div class="sheet-handle"></div><header class="sheet-header"><div><p>Collection management</p><h2>Organize your folders.</h2></div><button class="sheet-close" data-action="close-collection-sheet">Close</button></header><div class="collection-management-list">' + (custom.length ? custom.map((item) => '<div class="collection-management-row"><div><strong>' + escapeHtml(item.name) + '</strong><small>Articles stay saved if this collection is deleted.</small></div><div class="collection-management-actions"><input data-rename-collection value="' + escapeHtml(item.name) + '" maxlength="60" aria-label="Rename ' + escapeHtml(item.name) + '" /><button data-action="rename-collection" data-id="' + escapeHtml(item.id) + '">Rename</button><button class="collection-delete" data-action="delete-collection" data-id="' + escapeHtml(item.id) + '">Delete</button></div></div>').join("") : '<p class="collection-management-empty">No collections yet. Create one from the library.</p>') + '</div><p class="collection-management-note">Articles start unassigned. Choose one or more collections from an article’s Organize sheet whenever you want.</p></section>';
}
function organizeMarkup(article) { if (!state.collectionSheet || state.collectionSheet.type !== "organize") return ""; const selected = article.collectionIds || []; return '<div class="sheet-backdrop" data-action="close-collection-sheet"></div><section class="collection-sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div><header class="sheet-header"><div><p>Organize article</p><h2>Choose collections.</h2></div><button class="sheet-close" data-action="close-collection-sheet">Close</button></header><div class="collection-check-list">' + state.collections.map((item) => '<label><input type="checkbox" data-collection-check value="' + escapeHtml(item.id) + '" ' + (selected.includes(item.id) ? "checked" : "") + ' /><span>' + escapeHtml(item.name) + '</span></label>').join("") + '</div><button class="collection-save" data-action="save-article-collections">Save organization</button></section>'; }
function articleListMarkup() {
  const query = state.searchQuery.trim().toLowerCase();
  const visibleArticles = (state.activeCollectionId === "all" ? state.articles : state.articles.filter((article) => article.collectionIds?.includes(state.activeCollectionId))).filter((article) => !query || [article.title, article.source, article.byline, article.textContent].some((value) => String(value || "").toLowerCase().includes(query)));
  if (!visibleArticles.length) {
    const hasFilter = state.activeCollectionId !== "all";
    const hasSearch = Boolean(query);
    return `<section class="empty-library"><span class="empty-library__icon">${icon("book", 24)}</span><div><h2>${hasSearch ? "No matching articles." : hasFilter ? "Nothing here yet." : "Your brief begins here."}</h2><p>${hasSearch ? "Try a different title, source, or keyword." : hasFilter ? "Organize an article into this collection to see it here." : "Save an article that deserves a little more time."}</p></div></section>`;
  }
  return `<section class="saved-section" aria-label="Saved articles"><div class="section-heading"><div><p>${state.activeCollectionId === "all" ? "Saved articles" : escapeHtml(state.collections.find((item) => item.id === state.activeCollectionId)?.name || "Collection")}</p><h2>Worth a return.</h2></div></div><div class="article-card-list">${visibleArticles.map((article) => {
    const preview = articlePreviewImage(article);
    return `<div class="swipe-card" data-swipe-card data-id="${article.id}"><button class="swipe-card__delete" data-action="delete-article" data-id="${article.id}" aria-label="Delete ${escapeHtml(article.title)}">${icon("trash", 20)}<span>Delete</span></button><div class="article-card-row"><button class="article-card" data-action="open-article" data-id="${article.id}">${preview ? `<img class="article-card__image" src="${escapeHtml(preview)}" alt="" loading="lazy" />` : `<span class="article-card__image article-card__image--empty">${icon("book", 34)}</span>`}<span class="article-card__copy"><span class="article-card__source">${escapeHtml(article.source)}${article.previewOnly ? '<em class="article-card__status">Preview</em>' : ""}</span><strong>${escapeHtml(article.title)}</strong><small>${articleReadingTime(article)} · saved ${formatDate(article.dateAdded)}</small></span></button><button class="article-card__delete-desktop" data-action="delete-article" data-id="${article.id}" aria-label="Delete ${escapeHtml(article.title)}">${icon("trash", 16)}<span>Delete</span></button></div></div>`;
  }).join("")}</div></section>`;
}

function homeCaptureMarkup() {
  return `<section class="home-capture" aria-label="Save an article"><form class="home-capture-form" id="home-capture-form"><label class="home-url-field"><span class="sr-only">Paste an article link</span>${icon("external", 18)}<input name="article-url" type="url" autocomplete="url" inputmode="url" placeholder="Paste a link..." ${state.busy ? "disabled" : ""} /></label><button class="home-capture-submit ${state.busy ? "is-busy" : ""}" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "<span class=\"spinner\"></span>" : icon("plus", 18)}<span>Add article</span></button></form></section>`;
}

function librarySearchMarkup() {
  return `<label class="library-search"><span class="sr-only">Search saved articles</span>${icon("search", 18)}<input data-search-articles type="search" value="${escapeHtml(state.searchQuery)}" placeholder="Search saved articles..." autocomplete="off" /></label>`;
}

function webFeatureStripMarkup() {
  if (state.articles.length || state.searchQuery.trim() || state.activeCollectionId !== "all") return "";
  return `<section class="web-feature-strip" aria-label="Why use huush"><article><span>${icon("book", 19)}</span><div><strong>Clean reading</strong><small>Strips ads and distractions.</small></div></article><article><span>${icon("mark", 19)}</span><div><strong>Private by default</strong><small>Your library stays on this device.</small></div></article><article><span>${icon("bookmark", 19)}</span><div><strong>Save for later</strong><small>Keep the articles worth returning to.</small></div></article></section>`;
}

function libraryMarkup() {
  const hasLibraryTools = state.articles.length || state.collections.length || state.searchQuery.trim() || state.activeCollectionId !== "all";
  return `<main class="dashboard-screen editorial-library"><div class="desktop-web-only">${desktopWebNavMarkup()}</div><div class="mobile-web-only"><header class="editorial-topbar editorial-topbar--clean"><span class="editorial-topbar__brand">huush</span><button class="theme-toggle" data-action="toggle-theme" aria-label="Switch to ${state.settings.theme === "light" ? "dark" : "light"} theme">${icon(state.settings.theme === "light" ? "moon" : "sun", 21)}</button></header></div><div class="desktop-web-only">${desktopLibraryHeroMarkup()}</div><div class="mobile-web-only"><section class="daily-brief daily-brief--clean"><h1>Your reading,<br /><span>worth keeping.</span></h1></section>${homeCaptureMarkup()}</div><div class="desktop-web-only">${hasLibraryTools ? `${collectionMarkup()}${librarySearchMarkup()}` : ""}</div><div class="mobile-web-only">${collectionMarkup()}${librarySearchMarkup()}</div>${articleListMarkup()}${webFeatureStripMarkup()}</main><div class="mobile-web-only">${bottomNavigationMarkup()}</div>${captureMarkup()}`;
}

function tagsPageMarkup() {
  const countFor = (id) => state.articles.filter((article) => article.collectionIds?.includes(id)).length;
  return `<main class="dashboard-screen tags-screen"><div class="desktop-web-only">${desktopWebNavMarkup()}</div><div class="mobile-web-only"><header class="editorial-topbar editorial-topbar--clean"><span class="editorial-topbar__brand">huush</span><button class="theme-toggle" data-action="toggle-theme" aria-label="Switch to ${state.settings.theme === "light" ? "dark" : "light"} theme">${icon(state.settings.theme === "light" ? "moon" : "sun", 21)}</button></header></div><section class="desktop-page-heading"><p>Organize your reading</p><h1>Keep your<br /><em>next reads.</em></h1><span>Collections make a calm library easier to return to.</span></section><section class="tags-heading"><p>Organize your library</p><h2>Tags</h2></section>${state.collections.length ? `<div class="tag-list" aria-label="Saved tags">${state.collections.map((item) => `<button class="tag-list__item" data-action="open-tag" data-collection-id="${escapeHtml(item.id)}"><span class="tag-list__icon">${icon("archive", 21)}</span><span><strong>${escapeHtml(item.name)}</strong><small>${countFor(item.id)} ${countFor(item.id) === 1 ? "article" : "articles"}</small></span>${icon("chevron", 19)}</button>`).join("")}</div>` : `<section class="empty-library tags-empty"><span class="empty-library__icon">${icon("archive", 24)}</span><div><h2>No tags yet.</h2><p>Create a collection from Library to organize saved articles.</p></div></section>`}</main><div class="mobile-web-only">${bottomNavigationMarkup()}</div>`;
}

function captureMarkup() {
  if (!state.captureOpen) return "";
  const busy = state.busy ? "is-busy" : "";
  return `<div class="capture-backdrop" data-action="close-capture" aria-hidden="true"></div><section class="capture-sheet" role="dialog" aria-modal="true" aria-labelledby="capture-title"><div class="sheet-handle"></div><header class="capture-sheet__header"><div><p>Add to your reading</p><h2 id="capture-title">Save an article.</h2></div><button class="sheet-close" data-action="close-capture">Close</button></header><p class="capture-sheet__intro">Paste one public article link, not a publisher homepage or section page. huush fetches directly first; incomplete results may be sent to smry.ai for a second extraction.</p><form class="capture__form capture__form--sheet" id="capture-form"><label class="sr-only" for="article-url">Article URL</label><input id="article-url" name="article-url" type="url" autocomplete="url" inputmode="url" placeholder="https://example.com/article" ${state.busy ? "disabled" : ""}/><button class="capture__submit ${busy}" type="submit" aria-label="Extract and save article" ${state.busy ? "disabled" : ""}>${state.busy ? "<span class=\"spinner\"></span>" : `<span class="capture-submit-text">Add article</span>${icon("arrowLeft", 21)}`}</button></form><p class="capture-sheet__note">Saved reading stays private on this device. Source URLs sent to smry.ai are handled under that service’s policies.</p></section>`;
}

function relativeTime(value) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "Unknown time";
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return "Just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hr ago`;
  if (seconds < 172800) return "Yesterday";
  return formatDate(value);
}

function logEventLabel(event = "") {
  return { "app.launch": "App launched", "app.resume": "App resumed", "app.pause": "App paused", "app.crash": "App crash captured", "settings.changed": "Setting changed", "article.save.start": "Article save started", "article.save.success": "Article saved", "article.save.fail": "Article save failed", "article.open": "Article opened", "article.delete": "Article deleted", "article.scroll": "Article progress", "error.js": "JavaScript error", "error.promise": "Unhandled promise", "error.capacitor": "Native plugin error", "network.status": "Network status", "storage.stats": "Storage statistics", "memory.warning": "Memory warning", "render.jank": "Render jank" }[event] || event.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function logLevelClass(level = "info") {
  return ["debug", "info", "warn", "error"].includes(level) ? level : "info";
}

function formatLogDetail(detail) {
  if (detail === null || detail === undefined || detail === "") return "{}";
  if (typeof detail === "string") return detail;
  try { return JSON.stringify(detail, null, 2); } catch { return String(detail); }
}

function filteredLogEvents() {
  const query = state.logViewerSearch.trim().toLowerCase();
  return state.logViewerEvents.filter((entry) => {
    if (state.logViewerFilter !== "all" && entry.level !== state.logViewerFilter) return false;
    return !query || String(entry.event).toLowerCase().includes(query) || formatLogDetail(entry.detail).toLowerCase().includes(query);
  });
}

function logRowMarkup(entry, index) {
  const key = `${entry.time || "unknown"}-${entry.event || "event"}-${index}`;
  const expanded = state.expandedLogKey === key;
  return `<article class="developer-log-row ${expanded ? "is-expanded" : ""}" data-action="toggle-log-entry" data-log-key="${escapeHtml(key)}"><div class="developer-log-row__header"><time>${escapeHtml(formatClock(entry.time))}</time><span class="developer-log-row__level developer-log-row__level--${logLevelClass(entry.level)}">${escapeHtml(entry.level || "info")}</span><strong>${escapeHtml(entry.event || "unknown.event")}</strong><span class="developer-log-row__chevron">${icon("chevron", 17)}</span></div>${expanded ? `<pre class="developer-log-row__detail">${escapeHtml(formatLogDetail(entry.detail))}</pre>` : ""}</article>`;
}

function developerOptionsMarkup() {
  if (!state.developerOptionsEnabled) return "";
  return `<section id="developer-options" class="settings-section-block developer-options" aria-labelledby="developer-options-title"><div class="settings-section-heading"><p>Developer</p><h2 id="developer-options-title">Developer options.</h2></div><div class="developer-options__list"><button type="button" class="developer-option-row" data-action="toggle-developer-logging" aria-pressed="${state.developerLoggingEnabled}"><span><strong>Logging enabled</strong><small>Keep diagnostic events on for troubleshooting.</small></span><b class="developer-toggle ${state.developerLoggingEnabled ? "is-on" : ""}">${state.developerLoggingEnabled ? "On" : "Off"}</b></button><button type="button" class="developer-option-row" data-action="toggle-developer-verbose" aria-pressed="${state.developerVerboseLogging}"><span><strong>Verbose logging</strong><small>Includes performance events and may impact performance.</small></span><b class="developer-toggle ${state.developerVerboseLogging ? "is-on" : ""}">${state.developerVerboseLogging ? "On" : "Off"}</b></button><button type="button" class="developer-option-row" data-action="open-log-viewer"><span><strong>View event log</strong><small>Search, filter, expand, and inspect the last 200 events.</small></span>${icon("chevron", 18)}</button><button type="button" class="developer-option-row" data-action="export-logs"><span><strong>Export logs</strong><small>Share a diagnostic JSON file only when you choose.</small></span>${icon("chevron", 18)}</button><button type="button" class="developer-option-row" data-action="clear-developer-logs"><span><strong>Clear logs</strong><small>Delete the diagnostic history without clearing articles.</small></span>${icon("trash", 18)}</button><button type="button" class="developer-option-row" data-action="simulate-error"><span><strong>Simulate error</strong><small>Generate a harmless test error for verification.</small></span>${icon("terminal", 18)}</button><button type="button" class="developer-option-row" data-action="reset-developer-options"><span><strong>Reset developer options</strong><small>Hide this section again without deleting logs.</small></span>${icon("chevron", 18)}</button><button type="button" class="developer-option-row" data-action="reset-settings"><span><strong>Reset reading defaults</strong><small>Restore Inter, 18px, and the light theme.</small></span>${icon("chevron", 18)}</button></div></section>`;
}

function logViewerMarkup() {
  const filtered = filteredLogEvents();
  const filters = ["all", "error", "warn", "info"];
  return `<main class="dashboard-screen log-viewer-screen"><header class="dashboard-topbar log-viewer-screen__header"><button class="profile-tile" data-action="close-log-viewer" aria-label="Back to developer options">${icon("arrowLeft", 22)}</button><div class="log-viewer-screen__title"><p>Developer options</p><h1>Event log</h1></div><span class="log-viewer-screen__count">${filtered.length}</span></header><div class="log-viewer-filters" role="toolbar" aria-label="Log filters">${filters.map((filter) => `<button class="log-filter-chip ${state.logViewerFilter === filter ? "is-active" : ""}" data-action="filter-logs" data-filter="${filter}">${filter[0].toUpperCase() + filter.slice(1)}</button>`).join("")}</div><label class="log-viewer-search">${icon("search", 17)}<span class="sr-only">Search events</span><input data-log-search type="search" value="${escapeHtml(state.logViewerSearch)}" placeholder="Search events..." autocomplete="off" /></label><div class="log-viewer-list">${filtered.length ? filtered.map(logRowMarkup).join("") : '<p class="log-empty">No matching events.</p>'}</div></main>`;
}

function settingsPreviewMarkup() {
  const selectedFont = FONTS.find((font) => font.id === state.settings.font) || FONTS[0];
  return `<section class="reading-preview-card" aria-labelledby="reading-preview-title"><div class="reading-preview-card__heading"><div><p>Live preview</p><h2 id="reading-preview-title">A quiet page.</h2></div><span>${escapeHtml(themeLabel())}</span></div><p class="reading-preview-card__sample" data-reading-preview style="font-family:${selectedFont.family};font-size:${state.settings.fontSize}px">The quick brown fox jumps over the lazy dog. Typography is the craft of endowing human language with a durable visual form.</p></section>`;
}

function clearDataConfirmMarkup() {
  return `<div class="confirm-backdrop" data-action="cancel-clear-data" aria-hidden="true"></div><section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-data-title"><div class="confirm-dialog__icon">${icon("trash", 22)}</div><h2 id="clear-data-title">Clear local library?</h2><p>This will remove all saved articles from this device. They will remain in your cloud account if sync is enabled.</p><div class="confirm-dialog__actions"><button data-action="cancel-clear-data">Cancel</button><button class="is-destructive" data-action="confirm-clear-data">Clear library</button></div></section>`;
}

function sizeControlMarkup() {
  return `<div class="setting-label-row"><p class="setting-label">Text size</p><span class="setting-size-value" data-setting-size>${state.settings.fontSize}px</span><span class="setting-default-label" data-size-default ${state.settings.fontSize === DEFAULT_SETTINGS.fontSize ? "" : "hidden"}>Default</span></div><div class="font-size-control"><button class="type-scale-button" data-action="change-size" data-delta="-1" data-size-decrement aria-label="Decrease text size">−</button><div class="font-size-slider"><span aria-hidden="true">A</span><input data-font-size-range type="range" min="14" max="24" step="1" value="${state.settings.fontSize}" aria-label="Text size" aria-valuetext="${state.settings.fontSize} pixels" /><span class="font-size-slider__large" aria-hidden="true">A</span></div><button class="type-scale-button" data-action="change-size" data-delta="1" data-size-increment aria-label="Increase text size">+</button></div><div class="font-size-ticks" aria-hidden="true">${[14,16,18,20,22,24].map((size) => `<span class="${size === state.settings.fontSize ? "is-current" : ""}">${size}</span>`).join("")}</div>`;
}

function themeOptionsMarkup() {
  const options = [{ id: "system", label: "System", iconName: "settings" }, { id: "light", label: "Light", iconName: "sun" }, { id: "dark", label: "Dark", iconName: "moon" }, { id: "sepia", label: "Sepia", iconName: "book" }];
  return options.map((option) => `<button class="theme-choice ${state.settings.theme === option.id ? "is-active" : ""}" data-action="set-theme" data-theme="${option.id}" role="radio" aria-checked="${state.settings.theme === option.id}" aria-label="${option.label} theme"><span class="theme-preview theme-preview--${option.id}">${icon(option.iconName, 16)}</span><span>${option.label}</span><i class="theme-choice__radio" aria-hidden="true"></i></button>`).join("");
}

function settingsPageMarkup() {
  return `<main class="dashboard-screen settings-screen"><div class="desktop-web-only">${desktopWebNavMarkup()}</div><div class="mobile-web-only"><header class="dashboard-topbar"><button class="profile-tile" data-action="show-library" aria-label="Return to library">${icon("arrowLeft", 22)}</button>${logoMarkup()}<span class="topbar-spacer" aria-hidden="true"></span></header></div><section class="desktop-page-heading"><p>Reading preferences</p><h1>Keep your<br /><em>signal clear.</em></h1><span>A few quiet controls for a page that feels like yours.</span></section><section class="mobile-web-only"><section class="welcome-copy welcome-copy--compact"><h1>Keep your<br /><em>signal clear.</em></h1></section></section><section class="settings-section-block settings-reading" aria-labelledby="reading-settings-title"><div class="settings-section-heading"><p>Reading</p><h2 id="reading-settings-title">Make it yours.</h2></div>${settingsPreviewMarkup()}<div class="settings-control-group"><p class="setting-label">Typeface</p><div class="font-chip-grid" role="radiogroup" aria-label="Reading typeface">${fontOptionsMarkup()}</div></div><div class="settings-control-group">${sizeControlMarkup()}</div><div class="settings-control-group"><div class="settings-control-heading"><p class="setting-label">Theme</p><span class="settings-control-hint">${escapeHtml(themeLabel())}</span></div><div class="theme-choice-grid" role="radiogroup" aria-label="Reading theme">${themeOptionsMarkup()}</div></div></section><section class="settings-section-block settings-general" aria-labelledby="general-settings-title"><div class="settings-section-heading"><p>Storage</p><h2 id="general-settings-title">A little housekeeping.</h2></div><div class="settings-info-list"><div class="settings-info-row"><span class="settings-info-row__icon">${icon("archive", 19)}</span><span><strong>Offline storage</strong><small>${state.articles.length} ${state.articles.length === 1 ? "article" : "articles"} saved privately on this device.</small></span></div><div class="settings-info-row"><span class="settings-info-row__icon">${icon("settings", 19)}</span><span><strong>Notifications</strong><small>Not configured. Huush stays quiet until you ask it to.</small></span></div><button type="button" class="settings-info-row settings-info-row--destructive" data-action="clear-data"><span class="settings-info-row__icon">${icon("trash", 19)}</span><span><strong>Clear local library</strong><small>Remove all saved articles from this device.</small></span></button></div></section><section class="settings-section-block settings-about" aria-labelledby="about-settings-title"><div class="settings-section-heading"><p>About</p><h2 id="about-settings-title">Quiet by design.</h2></div><div class="settings-info-list"><button class="about-version-row" data-action="version-tap"><span><strong>App version</strong><small>${APP_VERSION}</small></span></button><button class="about-version-row" data-action="open-licenses"><span><strong>Open source licenses</strong><small>Third-party notices bundled with Huush.</small></span>${icon("chevron", 18)}</button></div></section>${developerOptionsMarkup()}${state.confirmClear ? clearDataConfirmMarkup() : ""}</main><div class="mobile-web-only">${bottomNavigationMarkup()}</div>`;
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
  return `<main class="reader-view ${state.focusMode ? "is-focus" : ""}"><div class="reader-progress" role="progressbar" aria-label="Reading progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${state.articleProgress}" style="--progress:${state.articleProgress}%"></div><header class="reader-toolbar ${state.readerToolbarHidden ? "is-hidden" : ""}" aria-hidden="${state.readerToolbarHidden ? "true" : "false"}"><button class="reader-tool reader-tool--back" data-action="back-library" aria-label="Back to saved articles">${icon("arrowLeft", 22)}</button><div class="reader-toolbar__identity"><span>${escapeHtml(article.source)}</span></div><div class="reader-toolbar__actions"><button class="reader-tool" data-action="toggle-theme" aria-label="Switch to ${nextThemePreference()} theme">${icon(effectiveTheme() === "light" ? "moon" : "sun", 20)}</button><button class="reader-tool reader-tool--font" data-action="open-settings" aria-label="Reading settings"><span aria-hidden="true">Aa</span></button><button class="reader-tool" data-action="copy-source" aria-label="Copy source link">${icon("copy", 20)}</button></div></header><section class="reader-scroll-surface" aria-label="Article reader"><article class="article-reading" data-font="${state.settings.font}"><section class="article-reading__opening"><p class="article-reading__source">${escapeHtml(article.source)}</p><h1>${escapeHtml(article.title)}</h1><div class="article-reading__meta"><span>By ${escapeHtml(article.byline)}</span><i></i><span>${formatDate(article.dateAdded)} · ${articleReadingTime(article)}</span></div></section><div class="article-reading__body">${previewNotice}${content}</div><footer class="article-reading__footer" aria-label="Article actions"><button class="collection-organize-button" data-action="open-organize" data-id="${article.id}">Organize</button>${article.previewOnly ? "" : `<a class="article-reading__source-action" href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">Open source ${icon("external", 15)}</a>`}</footer></article></section><p class="focus-announce" aria-live="polite"></p></main>${settingsMarkup()}`;
}

function fontOptionsMarkup() {
  return FONTS.map((font) => `<button class="font-chip ${state.settings.font === font.id ? "is-active" : ""}" data-action="set-font" data-font="${font.id}" style="--choice-font:${font.family}" role="radio" aria-checked="${state.settings.font === font.id}" aria-label="${font.label}${state.settings.font === font.id ? ", selected" : ", double-tap to select"}"><span>Aa</span><small>${font.label}</small><i class="font-chip__check" aria-hidden="true">✓</i></button>`).join("");
}

function settingsMarkup() {
  if (!state.settingsOpen) return "";
  return `<div class="sheet-backdrop" data-action="close-settings" aria-hidden="true"></div><section class="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div class="sheet-handle"></div><header class="sheet-header"><div><p>Reading preferences</p><h2 id="settings-title">Set the pace.</h2></div><button class="sheet-close" data-action="close-settings">Close</button></header>${settingsPreviewMarkup()}<div class="settings-section"><p class="setting-label">Typeface</p><div class="font-chip-grid" role="radiogroup" aria-label="Reading typeface">${fontOptionsMarkup()}</div></div><div class="settings-section">${sizeControlMarkup(true)}</div><div class="settings-section"><p class="setting-label">Theme</p><div class="theme-choice-grid" role="radiogroup" aria-label="Reading theme">${themeOptionsMarkup()}</div></div></section>`;
}

function toastMarkup() {
  if (!state.toast) return "";
  return `<div class="toast toast--${state.toast.type}" role="status"><span>${state.toast.type === "error" ? "!" : "✓"}</span><p>${escapeHtml(state.toast.message)}</p>${state.toast.action ? `<button class="toast__action" data-action="${state.toast.action}">Undo</button>` : ""}<button data-action="dismiss-toast" aria-label="Dismiss message">×</button></div>`;
}

function render() {
  const root = document.querySelector("#root");
  const transition = state.viewTransition;
  state.viewTransition = "";
  const useNativeViewTransition = Boolean(transition && document.startViewTransition && !reducedMotionPreferred());
  const update = () => {
    const shellClass = transition && !useNativeViewTransition ? ` app-shell--view-${transition}` : "";
    root.innerHTML = `<div class="app-shell${shellClass}">${state.logViewerOpen ? logViewerMarkup() : state.article ? readerMarkup() : state.activeTab === "settings" ? settingsPageMarkup() : state.activeTab === "tags" ? tagsPageMarkup() : libraryMarkup()}${state.logViewerOpen || state.article || state.activeTab === "library" ? "" : captureMarkup()}${state.collectionSheet?.type === "manage" ? collectionManagementMarkup() : state.collectionSheet?.type === "new" ? `<div class="sheet-backdrop" data-action="close-collection-sheet"></div><section class="collection-sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div><header class="sheet-header"><div><p>New collection</p><h2>Name your folder.</h2></div><button class="sheet-close" data-action="close-collection-sheet">Close</button></header><label class="collection-name-label">Collection name<input data-collection-name maxlength="60" placeholder="e.g. Weekend reads" /></label><button class="collection-save" data-action="create-collection">Create collection</button></section>` : state.collectionSheet?.type === "organize" ? organizeMarkup(state.articles.find((item) => item.id === state.collectionSheet.articleId) || state.article) : ""}${toastMarkup()}</div>`;
    applySettings();
    if (transition) {
      const nextShell = root.querySelector(".app-shell");
      window.setTimeout(() => nextShell?.classList.remove(`app-shell--view-${transition}`), reducedMotionPreferred() ? 0 : 420);
    }
    if (state.article) requestAnimationFrame(() => {
      const surface = document.querySelector(".reader-scroll-surface");
      if (surface) {
        surface.scrollTop = state.articleScrollTop;
        readerLastScrollTop = state.articleScrollTop;
        syncReaderToolbar();
      }
    });
  };
  if (useNativeViewTransition) {
    document.documentElement.dataset.viewTransition = transition;
    try {
      const viewTransition = document.startViewTransition(update);
      void viewTransition.finished.finally(() => { delete document.documentElement.dataset.viewTransition; });
      return;
    } catch {
      delete document.documentElement.dataset.viewTransition;
      // Fall back to the normal synchronous update on unsupported WebViews.
    }
  }
  update();
}

async function handleExtractUrl(url) {
  const startedAt = performance.now();
  log("article.save.start", { url, source: (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "unknown"; } })() });
  let saveStage = "fetch";
  state.busy = true;
  render();
  try {
    const article = await extractArticle(url, { log });
    saveStage = "parse";
    const savedArticle = await saveArticle(article);
    saveStage = "store";
    const imageCount = (article.content || "").match(/<img\b/gi)?.length || 0;
    log("article.save.success", { url, parseTimeMs: Math.round(performance.now() - startedAt), wordCount: String(article.textContent || stripHtml(article.content || "")).split(/\s+/).filter(Boolean).length, imageCount });
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
    log("article.save.fail", { url, error: errorMessage, stage: saveStage }, "error");
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

async function deleteArticle(id, trigger = "menu") {
  const index = state.articles.findIndex((article) => article.id === id);
  if (index < 0) return;
  const article = await removeArticle(id);
  state.articles = state.articles.filter((saved) => saved.id !== id);
  state.pendingDelete = { article, index };
  logger.log("article.delete", { id, trigger });
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
  return JSON.stringify(logger.export(), null, 2);
}

function diagnosticFilename() {
  return `huush-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
}

async function exportLogs() {
  const filename = diagnosticFilename();
  const data = buildLogExport();
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache, encoding: Encoding.UTF8, recursive: true });
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    await Share.share({ title: "Huush diagnostics", text: "Huush diagnostic log", url: uri, dialogTitle: "Share Huush diagnostics" });
    return;
  }
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function toggleDeveloperOptions() {
  state.developerOptionsEnabled = !state.developerOptionsEnabled;
  try { window.localStorage.setItem(STORAGE_FLAGS.developer, String(state.developerOptionsEnabled)); } catch { /* no-op */ }
  if (!state.developerOptionsEnabled) {
    const section = document.querySelector("#developer-options");
    section?.classList.add("hidden");
    if (section) section.style.display = "none";
    showToastInPlace("Developer options hidden.", "neutral");
    return;
  }
  const section = document.querySelector("#developer-options");
  if (section) {
    section.classList.remove("hidden");
    section.style.removeProperty("display");
    section.removeAttribute("aria-hidden");
  } else {
    document.querySelector(".settings-about")?.insertAdjacentHTML("afterend", developerOptionsMarkup());
  }
  showToastInPlace("Developer options enabled.", "success");
}

function resetReadingDefaults() {
  const previous = { ...state.settings };
  state.settings = { ...DEFAULT_SETTINGS };
  Object.keys(DEFAULT_SETTINGS).forEach((key) => logSettingsChanged(key, previous[key], state.settings[key]));
  void persistSettings();
  logger.log("settings.reset", {});
  showToast("Reading defaults restored.", "success");
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
  if (state.logViewerOpen) {
    state.logViewerOpen = false;
    state.logViewerEvents = [];
    state.logViewerSearch = "";
    state.expandedLogKey = "";
    logScreenChange("settings", "back");
    render();
    return true;
  }
  if (state.collectionSheet) { closeVisibleSheet(() => { state.collectionSheet = null; render(); }); return true; }
  if (state.captureOpen) {
    closeVisibleSheet(() => { state.captureOpen = false; render(); });
    return true;
  }
  if (state.settingsOpen) {
    closeVisibleSheet(() => { state.settingsOpen = false; render(); });
    return true;
  }
  if (state.focusMode) {
    setFocusMode(false);
    return true;
  }
  if (state.article) {
    invalidateSmryRequest();
    setViewTransition("back");
    state.article = null;
    state.articleScrollTop = 0;
    state.articleProgress = 0;
    readerLastScrollTop = 0;
    state.readerToolbarHidden = false;
    state.activeTab = "library";
    logScreenChange("library", "back");
    render();
    return true;
  }
  if (state.activeTab !== "library") {
    setViewTransition("back");
    state.activeTab = "library";
    logScreenChange("library", "back");
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
    logScreenChange("library", "tap");
    setViewTransition("back");
    state.activeTab = "library";
    state.article = null;
    state.captureOpen = false;
    state.logViewerOpen = false;
    state.logViewerEvents = [];
    state.focusMode = false;
    state.readerToolbarHidden = false;
    readerLastScrollTop = 0;
    render();
    return;
  }
  if (action === "show-tags") {
    invalidateSmryRequest();
    logScreenChange("tags", "tap");
    setViewTransition("forward");
    state.activeTab = "tags";
    state.article = null;
    state.captureOpen = false;
    state.settingsOpen = false;
    state.focusMode = false;
    state.readerToolbarHidden = false;
    readerLastScrollTop = 0;
    render();
    return;
  }
  if (action === "show-settings" || action === "show-debug") {
    invalidateSmryRequest();
    const fromScreen = document.documentElement.dataset.huushScreen || "library";
    logScreenChange("settings", "tap");
    setViewTransition("forward");
    void ensureFontPickerFontsLoaded();
    state.activeTab = "settings";
    state.article = null;
    state.captureOpen = false;
    state.settingsOpen = false;
    state.focusMode = false;
    state.readerToolbarHidden = false;
    state.logViewerOpen = false;
    state.logViewerEvents = [];
    state.confirmClear = false;
    readerLastScrollTop = 0;
    logger.log("settings.opened", { fromScreen });
    logStorageStats();
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
    closeVisibleSheet(() => { state.captureOpen = false; render(); });
    return;
  }
  if (action === "set-collection") { state.activeCollectionId = target.dataset.collectionId || "all"; state.activeTab = "library"; render(); return; }
  if (action === "open-tag") { state.activeCollectionId = target.dataset.collectionId || "all"; state.activeTab = "library"; render(); return; }
  if (action === "manage-collections") { state.collectionSheet = { type: "manage" }; render(); return; }
  if (action === "rename-collection") { const item = state.collections.find((entry) => entry.id === target.dataset.id); const input = target.closest(".collection-management-row")?.querySelector("[data-rename-collection]"); const name = input?.value.trim().slice(0, 60); if (!item || !name) return; if (state.collections.some((entry) => entry.id !== item.id && entry.name.toLowerCase() === name.toLowerCase())) { showToast("That collection already exists.", "error"); return; } item.name = name; await storage.set(KEYS.collections, state.collections); render(); return; }
  if (action === "delete-collection") { const id = target.dataset.id; const item = state.collections.find((entry) => entry.id === id); if (!item) return; if (!window.confirm(`Delete the “${item.name}” collection? Articles will be kept.`)) return; const articles = await listArticles(); await Promise.all(articles.filter((article) => article.collectionIds?.includes(id)).map((article) => setArticleCollections(article.id, article.collectionIds.filter((entry) => entry !== id)))); state.collections = state.collections.filter((entry) => entry.id !== id); if (state.activeCollectionId === id) state.activeCollectionId = "all"; state.articles = await listArticles(); if (state.article) state.article = state.articles.find((article) => article.id === state.article.id) || state.article; await storage.set(KEYS.collections, state.collections); state.collectionSheet = null; render(); return; }
  if (action === "open-new-collection") { state.collectionSheet = { type: "new" }; render(); requestAnimationFrame(() => document.querySelector("[data-collection-name]")?.focus()); return; }
  if (action === "close-collection-sheet") { closeVisibleSheet(() => { state.collectionSheet = null; render(); }); return; }
  if (action === "create-collection") { const input = document.querySelector("[data-collection-name]"); const name = input?.value.trim().slice(0, 60); if (!name) return; if (state.collections.some((item) => item.name.toLowerCase() === name.toLowerCase())) { showToast("That collection already exists.", "error"); return; } state.collections = [...state.collections, { id: `collection-${Date.now()}`, name }]; await storage.set(KEYS.collections, state.collections); logger.log("collection.create", { name, color: null }); state.collectionSheet = null; render(); return; }
  if (action === "open-organize") { state.collectionSheet = { type: "organize", articleId: target.dataset.id }; render(); return; }
  if (action === "save-article-collections") { const article = state.articles.find((item) => item.id === state.collectionSheet?.articleId); if (article) { const ids = [...document.querySelectorAll("[data-collection-check]:checked")].map((input) => input.value); await setArticleCollections(article.id, ids); state.articles = await listArticles(); if (state.article?.id === article.id) state.article = state.articles.find((item) => item.id === article.id) || state.article; } state.collectionSheet = null; render(); return; }
  if (action === "open-article") {
    invalidateSmryRequest();
    setViewTransition("forward");
    state.article = state.articles.find((article) => article.id === target.dataset.id) || null;
    state.collectionSheet = null;
    state.articleScrollTop = 0;
    state.articleProgress = 0;
    readerLastScrollTop = 0;
    lastReaderScrollMilestone = 0;
    readerOpenedAt = Date.now();
    state.readerToolbarHidden = false;
    state.focusMode = false;
    if (state.article) { logScreenChange("reader", "tap"); logger.log("article.open", { id: state.article.id, title: state.article.title, source: state.article.source, savedAt: state.article.dateAdded }); }
    render();
    return;
  }
  if (action === "delete-article") {
    await deleteArticle(target.dataset.id, "menu");
    return;
  }
  if (action === "undo-delete") {
    await undoDelete();
    return;
  }
  if (action === "clear-data") {
    state.confirmClear = true;
    render();
    return;
  }
  if (action === "cancel-clear-data") {
    state.confirmClear = false;
    render();
    return;
  }
  if (action === "confirm-clear-data") {
    state.confirmClear = false;
    await Promise.all(state.articles.map((article) => removeArticle(article.id)));
    state.articles = [];
    state.collections = [];
    state.activeCollectionId = "all";
    state.searchQuery = "";
    state.pendingDelete = null;
    await storage.set(KEYS.collections, []);
    logger.log("storage.stats", { articles: 0, totalBytes: 0, freeBytes: null });
    showToast("Local library cleared.", "success");
    return;
  }
  if (action === "back-library") return navigateBack();
  if (action === "open-settings") {
    state.focusMode = false;
    state.settingsOpen = true;
    void ensureFontPickerFontsLoaded();
    render();
    return;
  }
  if (action === "close-settings") {
    closeVisibleSheet(() => { state.settingsOpen = false; render(); });
    return;
  }
  if (action === "set-font") {
    const selectedFont = FONTS.find((font) => font.id === target.dataset.font) || FONTS[0];
    if (selectedFont.id === state.settings.font || !beginSettingsInteraction()) return;
    const oldFont = state.settings.font;
    state.settings.font = selectedFont.id;
    state.settings.readerLineHeight = selectedFont.bodyLineHeight;
    state.settings.readerTitleLineHeight = selectedFont.titleLineHeight;
    logSettingsChanged("font", oldFont, selectedFont.id);
    applySettings();
    syncPreferenceControls();
    await ensureFontLoaded(selectedFont.id);
    await persistSettings();
    return;
  }
  if (action === "change-size") {
    if (!beginSettingsInteraction()) return;
    const nextSize = Math.min(24, Math.max(14, state.settings.fontSize + Number(target.dataset.delta)));
    if (nextSize === state.settings.fontSize) return;
    const oldSize = state.settings.fontSize;
    state.settings.fontSize = nextSize;
    logSettingsChanged("fontSize", oldSize, nextSize);
    await persistSettings();
    return;
  }
  if (action === "set-theme") {
    const nextTheme = ["system", "light", "dark", "sepia"].includes(target.dataset.theme) ? target.dataset.theme : "light";
    if (nextTheme === state.settings.theme || !beginSettingsInteraction()) return;
    const oldTheme = state.settings.theme;
    state.settings.theme = nextTheme;
    logSettingsChanged("theme", oldTheme, nextTheme);
    await persistSettings();
    return;
  }
  if (action === "toggle-theme") {
    if (!beginSettingsInteraction()) return;
    const oldTheme = state.settings.theme;
    state.settings.theme = nextThemePreference();
    logSettingsChanged("theme", oldTheme, state.settings.theme);
    await persistSettings();
    return;
  }
  if (action === "version-tap") {
    const now = Date.now();
    if (now - lastVersionTapAt > 3000) versionTapCount = 0;
    versionTapCount += 1;
    lastVersionTapAt = now;
    if (versionTapCount === 5) showToastInPlace("2 more taps to enable developer options.", "neutral");
    if (versionTapCount >= 7) { versionTapCount = 0; toggleDeveloperOptions(); }
    return;
  }
  if (action === "open-licenses") { showToast("Open-source notices are bundled with Huush.", "neutral"); return; }
  if (action === "toggle-developer-logging") { state.developerLoggingEnabled = !state.developerLoggingEnabled; logger.setEnabled(state.developerLoggingEnabled); render(); return; }
  if (action === "toggle-developer-verbose") { state.developerVerboseLogging = !state.developerVerboseLogging; logger.setVerbose(state.developerVerboseLogging); render(); return; }
  if (action === "open-log-viewer") {
    logScreenChange("developer-logs", "tap");
    state.logViewerOpen = true;
    state.logViewerEvents = logger.getAllEvents().slice(-200).reverse();
    state.logViewerFilter = "all";
    state.logViewerSearch = "";
    state.expandedLogKey = "";
    render();
    return;
  }
  if (action === "close-log-viewer") { state.logViewerOpen = false; state.logViewerEvents = []; state.logViewerSearch = ""; state.expandedLogKey = ""; logScreenChange("settings", "back"); render(); return; }
  if (action === "filter-logs") { state.logViewerFilter = target.dataset.filter || "all"; render(); return; }
  if (action === "toggle-log-entry") { state.expandedLogKey = state.expandedLogKey === target.dataset.logKey ? "" : target.dataset.logKey || ""; render(); return; }
  if (action === "export-logs") {
    try { await exportLogs(); logger.log("diagnostics.exported", { eventCount: logger.getAllEvents().length }); showToastInPlace("Diagnostic JSON ready to share.", "success"); }
    catch (error) { logCapacitorError("Share", "share", error); showToast("Couldn’t export diagnostics.", "error"); }
    return;
  }
  if (action === "clear-developer-logs") {
    if (!window.confirm("Delete all diagnostic logs? This cannot be undone.")) return;
    logger.clear();
    state.logViewerEvents = [];
    showToastInPlace("Diagnostic logs cleared.", "success");
    return;
  }
  if (action === "simulate-error") {
    const testError = new Error("Huush simulated developer error");
    logger.log("error.test", { message: testError.message, stack: testError.stack }, "error");
    showToastInPlace("Test error logged. Check event log.", "neutral");
    return;
  }
  if (action === "reset-developer-options") {
    state.developerOptionsEnabled = false;
    state.developerLoggingEnabled = true;
    state.developerVerboseLogging = false;
    logger.setEnabled(true);
    logger.setVerbose(false);
    try { window.localStorage.removeItem(STORAGE_FLAGS.developer); } catch { /* no-op */ }
    const section = document.querySelector("#developer-options");
    if (section) {
      section.classList.add("hidden");
      section.style.display = "none";
      section.setAttribute("aria-hidden", "true");
    }
    showToastInPlace("Developer options hidden.", "neutral");
    return;
  }
  if (action === "reset-settings") { resetReadingDefaults(); return; }
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

const colorSchemeQuery = window.matchMedia?.("(prefers-color-scheme: dark)");
colorSchemeQuery?.addEventListener?.("change", () => {
  if (state.settings.theme === "system") {
    applySettings();
    syncPreferenceControls();
    if (state.activeTab === "settings" && !state.article) render();
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.matches("#capture-form, #home-capture-form")) {
    event.preventDefault();
    void handleExtract(event.target);
  }
});

document.addEventListener("input", (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  if (event.target.matches("[data-log-search]")) {
    state.logViewerSearch = event.target.value;
    window.clearTimeout(searchLogTimeout);
    searchLogTimeout = window.setTimeout(() => logger.log("search.query", { term: state.logViewerSearch, resultCount: filteredLogEvents().length, durationMs: 0 }), 350);
    render();
    requestAnimationFrame(() => { const field = document.querySelector("[data-log-search]"); field?.focus(); field?.setSelectionRange(state.logViewerSearch.length, state.logViewerSearch.length); });
    return;
  }
  if (event.target.matches("[data-search-articles]")) {
    state.searchQuery = event.target.value;
    render();
    requestAnimationFrame(() => {
      const field = document.querySelector("[data-search-articles]");
      if (field) {
        field.focus();
        field.setSelectionRange(state.searchQuery.length, state.searchQuery.length);
      }
    });
    return;
  }
  if (event.target.matches("[data-font-size-range]")) {
    queueFontSizePreview(event.target.value);
  }
});

document.addEventListener("change", (event) => {
  if (event.target instanceof HTMLInputElement && event.target.matches("[data-font-size-range]")) {
    const nextSize = Math.min(24, Math.max(14, Number(event.target.value)));
    const wasDragged = sliderInteractionDirty;
    sliderInteractionDirty = false;
    state.settings.fontSize = nextSize;
    if (!wasDragged) {
      applySettings();
      syncPreferenceControls();
      return;
    }
    logger.log("settings.changed", { key: "fontSize", oldValue: lastPersistedFontSize, newValue: nextSize });
    void persistSettings();
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
    void deleteArticle(id, "swipe");
    return;
  }
  if (shouldReveal) card.classList.add("is-revealed");
});

document.addEventListener("pointercancel", resetSwipeGesture);

document.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-action]");
  if (actionTarget?.closest("#developer-options")) {
    event.preventDefault();
    event.stopPropagation();
  }
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

document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (target?.matches("input, textarea, select, [contenteditable=\"true\"]")) return;
  const key = event.key.toLowerCase();
  if (key === "/" && state.activeTab === "library" && !state.article) {
    const search = document.querySelector("[data-search-articles]");
    if (search instanceof HTMLInputElement) {
      event.preventDefault();
      search.focus();
    }
    return;
  }
  if ((key === "n" || key === "a") && !state.captureOpen) {
    const addButton = document.querySelector('[data-action="open-capture"]');
    if (addButton instanceof HTMLElement) {
      event.preventDefault();
      void handleAction(addButton);
    }
    return;
  }
  if (key === "escape") {
    event.preventDefault();
    navigateBack();
    return;
  }
  if (key === "t") {
    const themeButton = document.querySelector('[data-action="toggle-theme"]');
    if (themeButton instanceof HTMLElement) {
      event.preventDefault();
      void handleAction(themeButton);
    }
    return;
  }
  if (key === "?") {
    event.preventDefault();
    showToastInPlace("Shortcuts: / search · N add article · T change theme · Esc back.");
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
    logCapacitorError("App", "backButton", error);
  }
}

async function setupAppLifecycleLogging() {
  const onStateChange = (isActive) => {
    if (isActive) {
      logger.log("app.resume", { backgroundDurationMs: lastPauseAt ? Math.max(0, Date.now() - lastPauseAt) : 0 });
      lastPauseAt = 0;
      return;
    }
    lastPauseAt = Date.now();
    logger.log("app.pause", { memoryWarning: false });
    logger.flush();
  };
  if (Capacitor.isNativePlatform()) {
    try { await CapacitorApp.addListener("appStateChange", ({ isActive }) => onStateChange(isActive)); }
    catch (error) { logCapacitorError("App", "appStateChange", error); }
  } else {
    document.addEventListener("visibilitychange", () => onStateChange(document.visibilityState === "visible"));
    window.addEventListener("beforeunload", () => logger.flush());
  }
}

async function init() {
  const [legacyArticles, savedSettings, savedLegacyLogs, savedCollections] = await Promise.all([storage.get(KEYS.articles, []), storage.get(KEYS.settings, DEFAULT_SETTINGS), storage.get("whitemint:logs", []), storage.get(KEYS.collections, [])]);
  state.settings = normalizeSettings(savedSettings);
  lastPersistedFontSize = state.settings.fontSize;
  state.developerOptionsEnabled = readLocalFlag(STORAGE_FLAGS.developer, false);
  state.developerLoggingEnabled = logger.enabled;
  state.developerVerboseLogging = logger.verbose;
  logger.migrateLegacyEvents(Array.isArray(savedLegacyLogs) ? savedLegacyLogs : []);
  state.collections = Array.isArray(savedCollections) ? savedCollections.filter((item) => item?.id && item.id !== "inbox" && item.name?.trim()).map((item) => ({ id: item.id, name: item.name.trim().slice(0, 60) })) : [];
  await storage.set(KEYS.collections, state.collections);
  await migrateLegacyArticles(Array.isArray(legacyArticles) ? legacyArticles : [], log);
  state.articles = await listArticles();
  document.documentElement.dataset.huushScreen = "library";
  logger.log("app.launch", { coldStart: true, version: APP_VERSION, platform: Capacitor.getPlatform(), webViewVersion: navigator.userAgent });
  logStorageStats();
  logMemoryWarningIfAvailable();
  await setupNativeBackHandling();
  await setupAppLifecycleLogging();
  render();
  preloadReadingFonts();
}

initAdaptiveLayout();
void init();
