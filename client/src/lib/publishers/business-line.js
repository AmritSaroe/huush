import { cleanText, fixByline, fixTitle, getHeroImageUrl, heroImage, stripImageByIdentity } from "../extractor/metadata.js";
import { sanitizeContent } from "../article-sanitizer.js";
import { textFromHtml } from "../extractor/sanitize.js";

const BUSINESS_LINE_HOSTS = new Set(["thehindubusinessline.com"]);
const ARTICLE_PATH = /\/article\d+\.ece(?:$|[?#])/i;
const BODY_SELECTORS = [
  '[itemprop="articleBody"]',
  "#ControlPara",
  ".article-main",
  ".article-main-col",
];

function normalizedHost(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return "";
  }
}

export function isBusinessLineUrl(url) {
  return BUSINESS_LINE_HOSTS.has(normalizedHost(url));
}

export function isArticleUrl(url) {
  try {
    return isBusinessLineUrl(url) && ARTICLE_PATH.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function articleBodyRoot(doc) {
  return BODY_SELECTORS.map((selector) => doc?.querySelector(selector)).find(Boolean) || null;
}

function businessLineByline(doc) {
  const schemaAuthors = [...doc.querySelectorAll('[itemprop="author"] [itemprop="name"]')]
    .map((node) => cleanText(node.getAttribute("content") || node.textContent))
    .filter(Boolean)
    .filter((author, index, values) => values.indexOf(author) === index);
  if (schemaAuthors.length) return schemaAuthors.join(" & ");

  const visibleAuthors = [...doc.querySelectorAll(".publisher-list .author a, [rel=\"author\"]")]
    .map((link) => cleanText(link.textContent))
    .filter(Boolean)
    .filter((author, index, values) => values.indexOf(author) === index);
  return visibleAuthors.join(" & ") || fixByline(doc, "");
}

function removePublisherNodes(root) {
  root.querySelectorAll([
    "script",
    "style",
    "noscript",
    "button",
    "#paywallbox",
    "#read-more",
    ".paywallbox-btn",
    ".publish-time",
    ".comment-btn",
    ".comments",
  ].join(", ")).forEach((node) => node.remove());

  root.querySelectorAll("a").forEach((link) => {
    if (!/^read\s+more$/i.test(cleanText(link.textContent))) return;
    const container = link.closest("p, div, section") || link;
    container.remove();
  });
}

function extractBody(doc, url) {
  const source = articleBodyRoot(doc);
  if (!source) return null;

  const root = source.cloneNode(true);
  const hasPublishedMarker = Boolean(root.querySelector("#end-of-article, .publish-time"));
  removePublisherNodes(root);

  const content = sanitizeContent(root.innerHTML, url);
  const textContent = textFromHtml(content);
  if (!textContent || textContent.length < 120) return null;

  return {
    content,
    textContent,
    hasPublishedMarker,
  };
}

function explicitAccessGate(doc) {
  const body = articleBodyRoot(doc);
  if (!body) return false;
  const text = cleanText(body.textContent);
  return /(?:subscription required|sign\s+in\s+to\s+read|login\s+to\s+continue|unlock\s+(?:this|the)\s+article)/i.test(text);
}

export const businessLineAdapter = {
  id: "business-line",
  matches: isBusinessLineUrl,
  isArticleUrl,
  preferPublisherCandidates: true,
  extractCandidates(doc, url) {
    if (!isArticleUrl(url)) return [];
    const body = extractBody(doc, url);
    if (!body) return [];

    const title = fixTitle(doc, "");
    const heroUrl = getHeroImageUrl(doc, url);
    const content = `${heroImage(doc, url, title)}${stripImageByIdentity(body.content, heroUrl, url)}`;
    const gated = explicitAccessGate(doc);

    return [{
      title,
      byline: businessLineByline(doc),
      content,
      textContent: textFromHtml(content),
      excerpt: body.textContent.slice(0, 240),
      gated,
      previewOnly: !body.hasPublishedMarker,
      _publisherSpecific: true,
      _strategy: "business-line-structured",
    }];
  },
};
