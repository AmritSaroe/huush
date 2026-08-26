import { Capacitor, CapacitorHttp } from "@capacitor/core";

export const TRANSPORT_CONFIG = {
  FETCH_TIMEOUT: 15000,
  MAX_HTML_CHARS: 2500000,
};

function responseText(data) {
  if (typeof data === "string") return data;
  if (data == null) return "";
  return String(data);
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function extractionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function fetchNative(url, options) {
  const startedAt = now();
  try {
    const response = await CapacitorHttp.get({
      url,
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        ...(options.headers || {}),
      },
      responseType: "text",
      connectTimeout: Math.min(8000, TRANSPORT_CONFIG.FETCH_TIMEOUT),
      readTimeout: TRANSPORT_CONFIG.FETCH_TIMEOUT,
    });
    const status = Number(response?.status || 0);
    if (status < 200 || status >= 300) throw extractionError(`http_${status}`, `HTTP ${status}`);
    const html = responseText(response?.data);
    options.log?.("fetch.native.timing", { status, durationMs: Math.round(now() - startedAt), htmlBytes: html.length }, "debug");
    return html;
  } catch (error) {
    options.log?.("fetch.native.timing", { durationMs: Math.round(now() - startedAt), failed: true, error: error instanceof Error ? error.message : String(error) }, "debug");
    throw error;
  }
}

async function fetchBrowser(url, options) {
  const startedAt = now();
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), options.timeout || TRANSPORT_CONFIG.FETCH_TIMEOUT) : null;
  try {
    const response = await fetch(url, {
      signal: controller?.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        ...(options.headers || {}),
      },
    });
    if (!response.ok) throw extractionError(`http_${response.status}`, `HTTP ${response.status}`);
    const html = await response.text();
    options.log?.("fetch.browser.timing", { status: response.status, durationMs: Math.round(now() - startedAt), htmlBytes: html.length }, "debug");
    return html;
  } catch (error) {
    options.log?.("fetch.browser.timing", { durationMs: Math.round(now() - startedAt), failed: true, error: error instanceof Error ? error.message : String(error) }, "debug");
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function assertHtmlSize(html) {
  if (html.length > TRANSPORT_CONFIG.MAX_HTML_CHARS) {
    throw extractionError("response_too_large", "The publisher returned an unexpectedly large page.");
  }
  if (html.length < 500) {
    throw extractionError("response_too_short", "The publisher returned an unexpectedly short page.");
  }
}

export async function fetchHtml(url, options = {}) {
  const isNative = Capacitor.isNativePlatform();
  const canUseWebProxy = !isNative && ["http:", "https:"].includes(globalThis.location?.protocol || "");

  if (canUseWebProxy) {
    const proxyUrl = new URL("/api/article-fetch", globalThis.location.origin);
    proxyUrl.searchParams.set("url", url);
    options.log?.("fetch.proxy.started", "Using Huush server proxy for browser import");
    try {
      const proxyResponse = await fetch(proxyUrl.href, {
        headers: { Accept: "text/html,application/xhtml+xml" },
      });
      if (!proxyResponse.ok) throw extractionError(`http_${proxyResponse.status}`, `HTTP ${proxyResponse.status}`);
      const html = await proxyResponse.text();
      assertHtmlSize(html);
      options.log?.("fetch.proxy.succeeded", proxyResponse.headers.get("x-huush-transport") || "server");
      return html;
    } catch (error) {
      options.log?.("fetch.proxy.failed", error instanceof Error ? error.message : "Proxy request failed; trying direct fetch");
    }
  }

  options.log?.("fetch.transport", isNative ? "native HTTP" : "direct browser fetch");
  const html = isNative ? await fetchNative(url, options) : await fetchBrowser(url, options);
  assertHtmlSize(html);
  return html;
}

export function createExtractionError(code, message) {
  return extractionError(code, message);
}
