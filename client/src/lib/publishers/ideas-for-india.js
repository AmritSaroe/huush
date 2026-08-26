import { cleanText, fixTitle, getHeroImageUrl, heroImage, stripImageByIdentity } from "../extractor/metadata.js";
import { sanitizeContent } from "../article-sanitizer.js";
import { textFromHtml } from "../extractor/sanitize.js";

const IDEAS_FOR_INDIA_HOSTS = new Set(["ideasforindia.in"]);
const ARTICLE_PATH = /^\/topics\//i;
const BODY_SELECTORS = [
  ".blog-rich-text.w-richtext",
  ".blog-left-upper-layout .blog-rich-text",
  ".blog-left-layout .blog-rich-text",
  '[post-text]',
];

function normalizedHost(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return "";
  }
}

export function isIdeasForIndiaUrl(url) {
  try {
    const parsed = new URL(url);
    return IDEAS_FOR_INDIA_HOSTS.has(normalizedHost(url)) && ARTICLE_PATH.test(parsed.pathname);
  } catch {
    return false;
  }
}

function articleBodyRoot(doc) {
  return BODY_SELECTORS.map((selector) => doc?.querySelector(selector)).find(Boolean) || null;
}

function ideasAuthor(doc) {
  const articleAuthor = doc.querySelector('.article-details a[href*="/profile/"]');
  if (articleAuthor) return cleanText(articleAuthor.textContent);

  const author = doc.querySelector('a.article-author-details, a[href*="/profile/"]');
  return cleanText(author?.textContent || "");
}

function removePageChrome(root) {
  root.querySelectorAll([
    "script",
    "style",
    "noscript",
    "form",
    "button",
    "input",
    "textarea",
    "select",
    "nav",
    "footer",
    '[class*="share"]',
    '[class*="newsletter"]',
    '[class*="related"]',
    '[class*="comment"]',
  ].join(", ")).forEach((node) => node.remove());

  root.querySelectorAll("a").forEach((link) => {
    const text = cleanText(link.textContent);
    if (/^(?:download|share|email|subscribe|sign\s*up)$/i.test(text)) link.remove();
  });
}

function extractBody(doc, url) {
  const source = articleBodyRoot(doc);
  if (!source) return null;

  const root = source.cloneNode(true);
  removePageChrome(root);
  const content = sanitizeContent(root.innerHTML, url);
  const textContent = textFromHtml(content);
  if (!textContent || textContent.length < 240) return null;

  return { content, textContent };
}

export const ideasForIndiaAdapter = {
  id: "ideas-for-india",
  matches: isIdeasForIndiaUrl,
  preferPublisherCandidates: true,
  extractCandidates(doc, url) {
    if (!isIdeasForIndiaUrl(url)) return [];
    const body = extractBody(doc, url);
    if (!body) return [];

    const title = fixTitle(doc, "");
    const heroUrl = getHeroImageUrl(doc, url);
    const content = `${heroImage(doc, url, title)}${stripImageByIdentity(body.content, heroUrl, url)}`;

    return [{
      title,
      byline: ideasAuthor(doc),
      content,
      textContent: textFromHtml(content),
      excerpt: body.textContent.slice(0, 240),
      gated: false,
      previewOnly: false,
      _publisherSpecific: true,
      _strategy: "ideas-for-india-structured",
    }];
  },
};
