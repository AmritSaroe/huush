import { Capacitor } from "@capacitor/core";

export const APP_VERSION = "2.6.5-content-cleanup";
const STORAGE_KEY = "huush_events";
const LEGACY_STORAGE_KEY = "whitemint:logs";
const ENABLED_KEY = "huush_logging_enabled";
const VERBOSE_KEY = "huush_verbose_logging";
const MAX_BUFFER = 200;
const MAX_STORAGE = 500;
const FLUSH_INTERVAL_MS = 10000;
const URL_FIELD_PATTERN = /(?:url|uri|href|source|link)$/i;

function safeUrl(value) {
  try {
    const url = new URL(String(value));
    return `${url.origin}${url.pathname}`;
  } catch {
    return String(value);
  }
}

function redactUrls(value) {
  return String(value).replace(/https?:\/\/[^\s"']+/gi, (match) => safeUrl(match.replace(/[),.;]+$/, "")));
}

function safeDetail(value, key = "") {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactUrls(URL_FIELD_PATTERN.test(key) && /^https?:\/\//i.test(value) ? safeUrl(value) : value);
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => safeDetail(item));
  return Object.fromEntries(Object.entries(value).slice(0, 80).map(([entryKey, entryValue]) => [entryKey, safeDetail(entryValue, entryKey)]));
}

function parseStored(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getStorageFlag(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === "true";
  } catch {
    return fallback;
  }
}

class HuushLogger {
  constructor() {
    this.buffer = [];
    this.maxBuffer = MAX_BUFFER;
    this.maxStorage = MAX_STORAGE;
    this.sessionId = this.generateSessionId();
    this.startTime = Date.now();
    this.enabled = getStorageFlag(ENABLED_KEY, true);
    this.verbose = getStorageFlag(VERBOSE_KEY, false);
    this.flushTimer = 0;
    this.lastJankAt = 0;
    this.lastFrameAt = typeof performance !== "undefined" ? performance.now() : 0;
    this.attachGlobalHandlers();
    this.attachNetworkHandlers();
    this.startFlushLoop();
    this.startPerformanceMonitor();
  }

  generateSessionId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  log(event, detail = {}, level = "info") {
    if (!this.enabled) return null;
    const entry = {
      time: new Date().toISOString(),
      session: this.sessionId,
      uptime: Date.now() - this.startTime,
      level: ["debug", "info", "warn", "error"].includes(level) ? level : "info",
      event: String(event),
      detail: safeDetail(typeof detail === "object" ? detail : { message: detail }),
    };
    this.buffer.push(entry);
    if (this.buffer.length > this.maxBuffer) this.buffer.splice(0, this.buffer.length - this.maxBuffer);
    if (import.meta.env?.DEV) console.info(`[${entry.level}] ${entry.event}`, entry.detail);
    return entry;
  }

  startFlushLoop() {
    this.flushTimer = window.setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  flush() {
    if (!this.buffer.length) return;
    try {
      const stored = parseStored(window.localStorage.getItem(STORAGE_KEY));
      const merged = [...stored, ...this.buffer].slice(-this.maxStorage);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      this.buffer = [];
    } catch {
      try {
        const stored = parseStored(window.localStorage.getItem(STORAGE_KEY));
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored.slice(-Math.floor(this.maxStorage / 2))));
      } catch {
        // Diagnostics must never destabilize the reader when storage is unavailable.
      }
    }
  }

  attachGlobalHandlers() {
    window.addEventListener("error", (event) => {
      const detail = { message: event.message, source: event.filename, lineno: event.lineno, colno: event.colno, stack: event.error?.stack };
      this.log("error.js", detail, "error");
      this.log("app.crash", { ...detail, screen: document.documentElement.dataset.huushScreen || "unknown" }, "error");
    });
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      const detail = { message: reason?.message || String(reason), stack: reason?.stack };
      this.log("error.promise", detail, "error");
      this.log("app.crash", { ...detail, screen: document.documentElement.dataset.huushScreen || "unknown" }, "error");
    });
  }

  attachNetworkHandlers() {
    const report = () => {
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      const type = !navigator.onLine ? "none" : connection?.type === "cellular" || connection?.effectiveType?.startsWith("2g") ? "cellular" : "wifi";
      this.log("network.status", { online: navigator.onLine, type });
    };
    window.addEventListener("online", report);
    window.addEventListener("offline", report);
    window.setTimeout(report, 0);
  }

  startPerformanceMonitor() {
    if (typeof window.requestAnimationFrame !== "function") return;
    const tick = (now) => {
      const frameMs = now - this.lastFrameAt;
      this.lastFrameAt = now;
      if (this.verbose && frameMs > 100 && now - this.lastJankAt > 5000) {
        this.lastJankAt = now;
        this.log("render.jank", { frameDropMs: Math.round(frameMs), screen: document.documentElement.dataset.huushScreen || "unknown" }, "warn");
      }
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    try { window.localStorage.setItem(ENABLED_KEY, String(this.enabled)); } catch { /* no-op */ }
  }

  setVerbose(verbose) {
    this.verbose = Boolean(verbose);
    try { window.localStorage.setItem(VERBOSE_KEY, String(this.verbose)); } catch { /* no-op */ }
  }

  migrateLegacyEvents(entries = []) {
    if (!Array.isArray(entries) || !entries.length) return;
    const existing = parseStored(window.localStorage.getItem(STORAGE_KEY));
    if (existing.length) return;
    const migrated = entries.slice(0, this.maxStorage).reverse().map((entry) => ({
      time: entry.time || new Date().toISOString(),
      session: this.sessionId,
      uptime: 0,
      level: "info",
      event: entry.event || "legacy.event",
      detail: safeDetail(typeof entry.detail === "string" ? { message: entry.detail } : entry.detail || {}),
    }));
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated.slice(-this.maxStorage))); } catch { /* no-op */ }
  }

  getAllEvents() {
    this.flush();
    return parseStored(window.localStorage.getItem(STORAGE_KEY));
  }

  clear() {
    this.buffer = [];
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch { /* no-op */ }
  }

  export() {
    const events = this.getAllEvents();
    return {
      app: "huush",
      exportedAt: new Date().toISOString(),
      platform: Capacitor.getPlatform(),
      version: APP_VERSION,
      session: this.sessionId,
      eventCount: events.length,
      events,
    };
  }
}

const logger = new HuushLogger();
export default logger;
