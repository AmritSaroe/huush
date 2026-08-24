import { fixByline, fixTitle, getHeroImageUrl, heroImage, stripImageByIdentity, cleanText } from "../extractor/metadata.js";
import { escapeHtml, htmlFromPlainText, sanitizeHtml, textFromHtml } from "../extractor/sanitize.js";
import { recordHasAccessGate } from "../extractor/paywall.js";

const ET_HOSTS = new Set(["economictimes.com", "economictimes.indiatimes.com"]);
const ARTICLE_PATH = /\/(?:primearticleshow|articleshow)\//i;
const INDEX_PATH = /^\/(?:prime|prime-exclusive|news|markets|wealth|industry|finance|business|hbr|small-business)(?:\/[^/]+)?$/i;

function hostWithoutPrefix(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return "";
  }
}

export function isEconomicTimesUrl(url) {
  return ET_HOSTS.has(hostWithoutPrefix(url));
}

export function isArticleUrl(url) {
  try {
    return isEconomicTimesUrl(url) && ARTICLE_PATH.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

export function isArticleIndexUrl(url) {
  try {
    const parsed = new URL(url);
    const host = hostWithoutPrefix(url);
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    if (!ET_HOSTS.has(host) || isArticleUrl(url)) return false;
    return path === "/" || INDEX_PATH.test(path);
  } catch {
    return false;
  }
}

function bodyFromRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return "";
  return [record.htmlContent, record.articleBody, record.body, record.content, record.text, record.storyText]
    .find((value) => typeof value === "string" && cleanText(value).length >= 200) || "";
}

export function storyJsonToHtml(value) {
  const render = (node) => {
    if (node == null) return "";
    if (Array.isArray(node)) return node.map(render).join("");
    if (typeof node !== "object") return escapeHtml(String(node));
    if (node.node === "text") return escapeHtml(node.text || node.value || "");
    if (node.node !== "element" && (node.child || node.children)) return render(node.child || node.children);

    const tag = String(node.tag || node.type || "div").toLowerCase();
    const inner = render(node.child || node.children || node.content || node.text);
    if (!inner.trim() && tag !== "br") return "";
    if (/^h[2-6]$/.test(tag)) return `<${tag}>${inner}</${tag}>`;
    if (["p", "blockquote", "pre"].includes(tag)) return `<${tag}>${inner}</${tag}>`;
    if (["ul", "ol", "li"].includes(tag)) return `<${tag}>${inner}</${tag}>`;
    if (["strong", "b", "em", "i", "u", "s", "code"].includes(tag)) return `<${tag}>${inner}</${tag}>`;
    if (tag === "br") return "<br />";
    return inner;
  };
  return render(value);
}

function looksLikeArticleRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const body = bodyFromRecord(value) || storyJsonToHtml(value.storyJSON);
  const title = value.headline || value.title || value.pageTitle || value.meta_title || value.story_page_meta_title;
  return Boolean(body && title);
}

function findArticleRecord(value, seen = new Set(), depth = 0) {
  if (!value || typeof value !== "object" || seen.has(value) || depth > 12) return null;
  seen.add(value);
  if (looksLikeArticleRecord(value)) return value;

  const priorityKeys = ["article", "articleData", "pageProps", "data", "page", "story", "content", "props", "state", "initialState"];
  for (const key of priorityKeys) {
    if (value[key]) {
      const found = findArticleRecord(value[key], seen, depth + 1);
      if (found) return found;
    }
  }
  for (const child of Object.values(value)) {
    const found = findArticleRecord(child, seen, depth + 1);
    if (found) return found;
  }
  return null;
}

function parseJsonScript(script) {
  try {
    const text = script.textContent || "";
    return text.trim() ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function parseAssignedObject(text, token) {
  const assignment = text.indexOf(token);
  if (assignment < 0) return null;
  const afterToken = text.slice(assignment + token.length);
  const wrapped = afterToken.match(/^\s*=\s*JSON\.parse\(/);

  if (wrapped) {
    const literalStart = assignment + token.length + wrapped[0].length;
    if (text[literalStart] !== '"') return null;
    let literalEnd = literalStart + 1;
    let escaped = false;
    for (; literalEnd < text.length; literalEnd += 1) {
      const character = text[literalEnd];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character === '"') break;
    }
    if (literalEnd >= text.length) return null;
    try {
      const decoded = JSON.parse(text.slice(literalStart, literalEnd + 1));
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  const start = text.indexOf("{", assignment);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, index + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function documentHasAccessGate(doc) {
  const html = doc?.documentElement?.innerHTML || "";
  return /etprimeblocker|etprime-blocker|subscription required|[\"']isAccessibleForFree[\"']\s*:\s*false/i.test(html);
}

function findEmbeddedRecord(doc) {
  const nextScript = doc.querySelector('script#__NEXT_DATA__, script[type="application/json"][id="__NEXT_DATA__"]');
  if (nextScript) {
    const data = findArticleRecord(parseJsonScript(nextScript));
    if (data) return data;
  }
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const data = findArticleRecord(parseJsonScript(script));
    if (data) return data;
  }
  for (const script of doc.querySelectorAll("script")) {
    const text = script.textContent || "";
    for (const token of ["window.__INITIAL_STATE__", "window.__DATA__", "window.appState"]) {
      const data = findArticleRecord(parseAssignedObject(text, token));
      if (data) return data;
    }
  }
  return null;
}

export function extractJsonCandidate(doc, url) {
  const record = findEmbeddedRecord(doc);
  if (!record) return null;

  const title = cleanText(record.headline || record.title || record.pageTitle || record.meta_title || record.story_page_meta_title || fixTitle(doc, ""));
  const byline = cleanText(record.author?.name || record.authorName || record.byline || fixByline(doc, ""));
  const recordBody = bodyFromRecord(record);
  const storyBody = storyJsonToHtml(record.storyJSON);
  const body = [recordBody, storyBody]
    .filter(Boolean)
    .sort((left, right) => textFromHtml(right).length - textFromHtml(left).length)[0] || "";
  if (!body) return null;

  const content = sanitizeHtml(body.includes("<") ? body : htmlFromPlainText(body), url);
  const textContent = textFromHtml(content) || cleanText(body);
  if (!textContent || textContent.length < 200) return null;

  return {
    title,
    byline,
    content: `${heroImage(doc, url, title)}${stripImageByIdentity(content, getHeroImageUrl(doc, url), url)}`,
    textContent,
    excerpt: textContent.slice(0, 240),
    gated: recordHasAccessGate(record) || documentHasAccessGate(doc),
    _record: record,
    _strategy: "economic-times-json",
  };
}


export const economicTimesAdapter = {
  id: "economic-times",
  matches: isEconomicTimesUrl,
  isArticleIndexUrl,
  detectAccessGate: documentHasAccessGate,
  extractCandidates(doc, url) {
    const json = extractJsonCandidate(doc, url);
    return json ? [json] : [];
  },
};
