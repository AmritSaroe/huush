const MAX_URL_LENGTH = 4096;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DIRECT_TIMEOUT_MS = 20_000;
const JINA_TIMEOUT_MS = 45_000;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;

const ALLOWED_HOSTS = [
  "thehindu.com",
  "business-standard.com",
  "mybs.in",
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

type Transport = "direct" | "jina-reader";
type FetchResult = { html: string; transport: Transport; finalUrl: string };

export class ProxyError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
    this.name = "ProxyError";
  }
}

function isAllowedHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return ALLOWED_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function parseTarget(request: Request) {
  const requestUrl = new URL(request.url);
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
    throw new ProxyError(403, "publisher_not_allowed", "This publisher is not enabled for the Huush web proxy.");
  }
  return target;
}

function clientKey(request: Request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

function enforceRateLimit(request: Request) {
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
  if (length > MAX_RESPONSE_BYTES) {
    throw new ProxyError(502, "response_too_large", "The publisher response is too large to import.");
  }

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

async function tryDirect(target: URL): Promise<FetchResult | null> {
  const response = await fetchWithTimeout(target.href, DIRECT_TIMEOUT_MS, {
    Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.8",
    "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36 Huush/1.5",
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
  return { html, transport: "direct", finalUrl: finalUrl.href };
}

async function tryJina(target: URL): Promise<FetchResult | null> {
  // Jina is a public-reader fallback, not an authenticated or paywall-bypass
  // channel. No user cookies or credentials are forwarded.
  const jinaUrl = `https://r.jina.ai/${target.href}`;
  const response = await fetchWithTimeout(jinaUrl, JINA_TIMEOUT_MS, {
    Accept: "text/html",
    "X-Respond-With": "html",
    "X-Engine": "browser",
    "X-With-Iframe": "true",
    "X-Timeout": "30",
    "User-Agent": "Huush/1.5 public-reader",
  });
  if (!response.ok) return null;
  const html = await readLimited(response);
  if (html.length < 500) return null;
  return { html, transport: "jina-reader", finalUrl: target.href };
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function handleArticleFetch(request: Request) {
  if (request.method !== "GET") {
    return jsonResponse(405, { ok: false, code: "method_not_allowed", error: "Use GET for article imports." });
  }

  try {
    enforceRateLimit(request);
    const target = parseTarget(request);

    let result: FetchResult | null = null;
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

    return new Response(result.html, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "X-Huush-Transport": result.transport,
        "X-Huush-Source": result.finalUrl,
      },
    });
  } catch (error) {
    if (error instanceof ProxyError) return jsonResponse(error.status, { ok: false, code: error.code, error: error.message });
    return jsonResponse(502, { ok: false, code: "proxy_error", error: "The article could not be fetched by the web proxy." });
  }
}

export async function handleSmryFetch(request: Request) {
  if (request.method !== "GET") {
    return jsonResponse(405, { ok: false, code: "method_not_allowed", error: "Use GET for smry article imports." });
  }

  try {
    enforceRateLimit(request);
    const target = parseTarget(request);
    const endpoint = new URL("https://smry.ai/api/llm/article");
    endpoint.searchParams.set("format", "agent");
    endpoint.searchParams.set("url", target.href);

    const upstream = await fetchWithTimeout(endpoint.href, JINA_TIMEOUT_MS, {
      Accept: "text/plain",
      "User-Agent": "Huush/1.5 public-reader",
    });
    if (!upstream.ok) throw new ProxyError(502, `smry_http_${upstream.status}`, `smry returned HTTP ${upstream.status}.`);

    const body = await readLimited(upstream);
    if (!body.trim()) throw new ProxyError(502, "smry_empty", "smry returned an empty article.");

    const headers = new Headers({
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "X-Huush-Transport": "smry-server",
    });
    for (const name of ["x-smry-title", "x-smry-author", "x-smry-publisher", "x-smry-source", "x-smry-tokens"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(body, { status: 200, headers });
  } catch (error) {
    if (error instanceof ProxyError) return jsonResponse(error.status, { ok: false, code: error.code, error: error.message });
    return jsonResponse(502, { ok: false, code: "smry_proxy_error", error: "The smry fallback could not be reached." });
  }
}
