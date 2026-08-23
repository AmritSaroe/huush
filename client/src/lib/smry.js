import { Capacitor, CapacitorHttp } from "@capacitor/core";

const SMRY_AGENT_ENDPOINT = "https://smry.ai/api/llm/article";
const SMRY_READER_ORIGIN = "https://smry.ai/";
const REQUEST_TIMEOUT = 20000;
const WEB_REQUEST_TIMEOUT = 45000;
const MAX_RESPONSE_CHARS = 500000;

export class SmryExtractionError extends Error {
  constructor(message, code = "smry_error", status = 0) {
    super(message);
    this.name = "SmryExtractionError";
    this.code = code;
    this.status = status;
  }
}

function normalizeSourceUrl(value) {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Unsupported protocol");
    parsed.hash = "";
    return parsed.toString();
  } catch {
    throw new SmryExtractionError("The source URL is not valid.", "invalid_url");
  }
}

function headerValue(headers = {}, name) {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key ? String(headers[key] ?? "") : "";
}

function chooseTitle(smryTitle, fallbackTitle) {
  const smry = String(smryTitle || "").trim();
  const fallback = String(fallbackTitle || "").trim();
  // smry documents that its response headers are ASCII-folded. A question mark
  // can therefore stand in for an apostrophe, dash, or accented character.
  // Preserve the direct publisher title whenever it retains those characters.
  if (fallback && /[^\x00-\x7F]/.test(fallback) && smry.includes("?")) return fallback;
  const repaired = smry.replace(/\?([A-Za-z])/g, "’$1");
  return repaired || fallback || "Untitled";
}

function responseText(data) {
  if (typeof data === "string") return data;
  if (data == null) return "";
  return String(data);
}

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function blocksToHtml(body) {
  return body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3).trim())}</h2>`;
    return `<p>${escapeHtml(line)}</p>`;
  }).join("");
}

function extractHeroHtml(fallbackArticle) {
  const match = String(fallbackArticle?.content || "").match(/<figure>[\s\S]*?<\/figure>/i);
  return match ? match[0] : "";
}

async function requestAgent(url) {
  const endpoint = new URL(SMRY_AGENT_ENDPOINT);
  endpoint.searchParams.set("format", "agent");
  endpoint.searchParams.set("url", normalizeSourceUrl(url));

  if (Capacitor.isNativePlatform()) {
    let response;
    try {
      response = await CapacitorHttp.get({
        url: endpoint.toString(),
        headers: { Accept: "text/plain" },
        responseType: "text",
        connectTimeout: 8000,
        readTimeout: REQUEST_TIMEOUT,
      });
    } catch (error) {
      throw new SmryExtractionError(error instanceof Error ? error.message : "smry request failed", "network_error");
    }
    const status = Number(response?.status || 0);
    if (status < 200 || status >= 300) throw new SmryExtractionError(`smry returned HTTP ${status}.`, `http_${status}`, status);
    return { body: responseText(response?.data), headers: response?.headers || {} };
  }

  const webProxyAvailable = Boolean(globalThis.location?.origin && globalThis.location.origin !== "null");
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), WEB_REQUEST_TIMEOUT) : null;
  try {
    let response;
    if (webProxyAvailable) {
      const proxyEndpoint = new URL("/api/smry-fetch", globalThis.location.origin);
      proxyEndpoint.searchParams.set("url", normalizeSourceUrl(url));
      try {
        response = await fetch(proxyEndpoint.toString(), { signal: controller?.signal, headers: { Accept: "text/plain" } });
      } catch (error) {
        throw new SmryExtractionError(error instanceof Error ? error.message : "smry proxy request failed", "network_error");
      }
    } else {
      try {
        response = await fetch(endpoint.toString(), { signal: controller?.signal, headers: { Accept: "text/plain" } });
      } catch (error) {
        throw new SmryExtractionError(error instanceof Error ? error.message : "smry request failed", "network_error");
      }
    }
    if (!response.ok) throw new SmryExtractionError(`smry returned HTTP ${response.status}.`, `http_${response.status}`, response.status);
    return { body: await response.text(), headers: Object.fromEntries(response.headers.entries()) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function getSmryReaderUrl(sourceUrl) {
  const normalized = normalizeSourceUrl(sourceUrl);
  return `${SMRY_READER_ORIGIN}${normalized}`;
}

export async function extractSmryArticle(sourceUrl, fallbackArticle = null) {
  const { body, headers } = await requestAgent(sourceUrl);
  if (!body.trim()) throw new SmryExtractionError("smry returned an empty article.", "empty_response");
  if (body.length > MAX_RESPONSE_CHARS) throw new SmryExtractionError("smry returned an unexpectedly large response.", "response_too_large");

  const textContent = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line) => !line.startsWith("[ref] ")).join(" ").replace(/\s+/g, " ").trim();
  const blockCount = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).length;
  if (textContent.length < 200 || blockCount < 3) throw new SmryExtractionError("smry returned only a partial article.", "partial_article");

  const title = chooseTitle(headerValue(headers, "x-smry-title"), fallbackArticle?.title);
  const byline = headerValue(headers, "x-smry-author") || fallbackArticle?.byline || "";
  const publisher = headerValue(headers, "x-smry-publisher") || fallbackArticle?.source || "Article";
  const provenanceUrl = headerValue(headers, "x-smry-source") || normalizeSourceUrl(sourceUrl);
  return {
    title,
    byline,
    source: publisher,
    content: `${extractHeroHtml(fallbackArticle)}${blocksToHtml(body)}`,
    textContent,
    excerpt: textContent.slice(0, 240),
    previewOnly: textContent.length < 1200 || blockCount < 3,
    provider: "smry",
    strategy: "smry-agent",
    provenance: { provider: "smry", sourceUrl: provenanceUrl, blocks: blockCount, tokens: headerValue(headers, "x-smry-tokens") },
  };
}
