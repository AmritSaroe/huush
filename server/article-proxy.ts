import type { IncomingMessage, ServerResponse } from "node:http";

const MAX_URL_LENGTH = 4096;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DIRECT_TIMEOUT_MS = 20_000;
const JINA_TIMEOUT_MS = 45_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = Math.min(120, Math.max(1, Number(process.env.WHITEMINT_PROXY_RATE_LIMIT || 30)));

const ALLOWED_HOSTS = [
  "thehindu.com",
  "business-standard.com",
  "thehindubusinessline.com",
  "indianexpress.com",
  "financialexpress.com",
  "economictimes.com",
  "indiatimes.com",
  "finshots.in",
  "livemint.com",
  "pib.gov.in",
  "epw.in",
  "noemamag.com",
];

const requestCounts = new Map<string, { startedAt: number; count: number }>();

function isAllowedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function parseTarget(request: IncomingMessage) {
  const requestUrl = new URL(request.url || "/", "http://whitemint.local");
  const rawTarget = requestUrl.searchParams.get("url") || "";
  if (!rawTarget || rawTarget.length > MAX_URL_LENGTH) {
    throw new ProxyError(400, "invalid_url", "A public article URL is required.");
  }

  let target: URL;
  try {
    target = new URL(rawTarget);
  } catch {
    throw new ProxyError(400, "invalid_url", "The article URL is not valid.");
  }

  if (!/^https?:$/.test(target.protocol) || target.username || target.password || target.port) {
    throw new ProxyError(400, "invalid_url", "Only public HTTP or HTTPS article URLs are supported.");
  }
  if (!isAllowedHost(target.hostname)) {
    throw new ProxyError(403, "publisher_not_allowed", "This publisher is not enabled for the Whitemint web proxy.");
  }
  return target;
}

function clientKey(request: IncomingMessage) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return request.socket.remoteAddress || "unknown";
}

function enforceRateLimit(request: IncomingMessage) {
  const key = clientKey(request);
  const now = Date.now();
  const entry = requestCounts.get(key);
  if (!entry || now - entry.startedAt >= RATE_WINDOW_MS) {
    requestCounts.set(key, { startedAt: now, count: 1 });
    return;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT) {
    throw new ProxyError(429, "rate_limited", "Too many article requests. Please try again shortly.");
  }
}

async function readLimited(response: Response) {
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_RESPONSE_BYTES) throw new ProxyError(502, "response_too_large", "The publisher response is too large to import.");

  const reader = response.body?.getReader();
  if (!reader) return await response.text();

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new ProxyError(502, "response_too_large", "The publisher response is too large to import.");
    }
    chunks.push(next.value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

async function fetchWithTimeout(url: string, timeoutMs: number, headers: HeadersInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { redirect: "follow", signal: controller.signal, headers });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProxyError(504, "upstream_timeout", "The publisher took too long to respond.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function tryDirect(target: URL) {
  const response = await fetchWithTimeout(target.href, DIRECT_TIMEOUT_MS, {
    Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.8",
    "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36 Whitemint/1.5",
  });

  let finalUrl: URL;
  try {
    finalUrl = new URL(response.url || target.href);
  } catch {
    finalUrl = target;
  }
  if (!isAllowedHost(finalUrl.hostname)) {
    throw new ProxyError(502, "redirect_not_allowed", "The publisher redirected to an unsupported host.");
  }

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.toLowerCase().includes("html")) return null;
  const html = await readLimited(response);
  if (html.length < 500) return null;
  return { html, transport: "direct" as const, finalUrl: finalUrl.href };
}

async function tryJina(target: URL) {
  // Jina is used as a public-reader fallback, not as an authenticated or
  // paywall-bypass channel. No user cookies or credentials are forwarded.
  const jinaUrl = `https://r.jina.ai/${target.href}`;
  const response = await fetchWithTimeout(jinaUrl, JINA_TIMEOUT_MS, {
    Accept: "text/html",
    "X-Respond-With": "html",
    "X-Engine": "browser",
    "X-With-Iframe": "true",
    "X-Timeout": "30",
    "User-Agent": "Whitemint/1.5 public-reader",
  });
  if (!response.ok) return null;
  const html = await readLimited(response);
  if (html.length < 500) return null;
  return { html, transport: "jina-reader" as const, finalUrl: target.href };
}

export class ProxyError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "ProxyError";
  }
}

function sendJson(response: ServerResponse, status: number, body: Record<string, unknown>) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(payload);
}

export async function handleArticleFetch(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") {
    sendJson(response, 405, { ok: false, code: "method_not_allowed", error: "Use GET for article imports." });
    return;
  }

  try {
    enforceRateLimit(request);
    const target = parseTarget(request);

    let result: { html: string; transport: "direct" | "jina-reader"; finalUrl: string } | null = null;
    try {
      result = await tryDirect(target);
    } catch (error) {
      if (error instanceof ProxyError && error.code === "redirect_not_allowed") throw error;
    }

    if (!result) result = await tryJina(target);
    if (!result) throw new ProxyError(502, "upstream_unavailable", "The publisher could not provide a readable public page.");

    if (!isAllowedHost(new URL(result.finalUrl).hostname)) {
      throw new ProxyError(502, "source_not_allowed", "The resolved article source is not supported.");
    }

    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Whitemint-Transport": result.transport,
      "X-Whitemint-Source": result.finalUrl,
    });
    response.end(result.html);
  } catch (error) {
    if (error instanceof ProxyError) {
      sendJson(response, error.status, { ok: false, code: error.code, error: error.message });
      return;
    }
    sendJson(response, 502, { ok: false, code: "proxy_error", error: "The article could not be fetched by the web proxy." });
  }
}


export async function handleSmryFetch(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") {
    sendJson(response, 405, { ok: false, code: "method_not_allowed", error: "Use GET for smry article imports." });
    return;
  }

  try {
    enforceRateLimit(request);
    const target = parseTarget(request);
    const endpoint = new URL("https://smry.ai/api/llm/article");
    endpoint.searchParams.set("format", "agent");
    endpoint.searchParams.set("url", target.href);

    const upstream = await fetchWithTimeout(endpoint.href, JINA_TIMEOUT_MS, {
      Accept: "text/plain",
      "User-Agent": "Whitemint/1.5 public-reader",
    });
    if (!upstream.ok) throw new ProxyError(502, `smry_http_${upstream.status}`, `smry returned HTTP ${upstream.status}.`);

    const body = await readLimited(upstream);
    if (!body.trim()) throw new ProxyError(502, "smry_empty", "smry returned an empty article.");

    const headers: Record<string, string> = {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Whitemint-Transport": "smry-server",
    };
    for (const name of ["x-smry-title", "x-smry-author", "x-smry-publisher", "x-smry-source", "x-smry-tokens"]) {
      const value = upstream.headers.get(name);
      if (value) headers[name] = value;
    }
    response.writeHead(200, headers);
    response.end(body);
  } catch (error) {
    if (error instanceof ProxyError) {
      sendJson(response, error.status, { ok: false, code: error.code, error: error.message });
      return;
    }
    sendJson(response, 502, { ok: false, code: "smry_proxy_error", error: "The smry fallback could not be reached." });
  }
}
