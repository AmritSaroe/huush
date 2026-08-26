import { sanitizeContent } from "../article-sanitizer.js";
import {
  cleanText,
  fixByline,
  fixTitle,
  getHeroImageUrl,
  heroImage,
  stripImageByIdentity,
} from "../extractor/metadata.js";
import { textFromHtml } from "../extractor/sanitize.js";
import { createGenericPublisherAdapter } from "./_generic-publisher.js";

const LIVE_MINT_HOSTS = new Set(["livemint.com"]);
const ARTICLE_PATH = /^\/(?!premium\/?$)[^?#]+/i;
const BODY_SELECTORS = [
  ".premium-article-body.contentSec",
  ".premium-article-body",
  "article.premiumNews .mainArea",
];
const HIDDEN_OR_CHROME = [
  "script",
  "style",
  "noscript",
  "iframe",
  "object",
  "embed",
  "form",
  "button",
  "input",
  "textarea",
  "select",
  ".alsoRead",
  '[class*="alsoRead"]',
  '[class*="social"]',
  '[class*="share"]',
  '[class*="related"]',
  '[class*="recommended"]',
  '[class*="subscription"]',
  '[class*="paywall"]',
  '[class*="premiumStoryAuthor"]',
  '[class*="pTopic"]',
  ".su_premium_box",
];

function normalizedHost(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return "";
  }
}

function isLiveMintUrl(url) {
  const host = normalizedHost(url);
  return [...LIVE_MINT_HOSTS].some((accepted) => host === accepted || host.endsWith(`.${accepted}`));
}

function isLiveMintArticleUrl(url) {
  try {
    return isLiveMintUrl(url) && ARTICLE_PATH.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

function articleBodyRoot(doc) {
  return BODY_SELECTORS.map((selector) => doc?.querySelector(selector)).find(Boolean) || null;
}

function visibleGateText(bodyRoot) {
  if (!bodyRoot) return "";
  return [...bodyRoot.querySelectorAll([
    ".subscriptionBox",
    ".paywall-container",
    ".paywall-blury",
    ".ctx",
    ".unlocked",
    ".su_premium_box",
  ].join(", "))]
    .map((node) => cleanText(node.textContent))
    .filter(Boolean)
    .join(" ");
}

function hasVisibleAccessGate(bodyRoot) {
  const text = visibleGateText(bodyRoot);
  return /want\s+to\s+read\s+the\s+full\s+story|unlock\s+(?:deeper insights|the full story|this article)|there['’]s\s+more\s+worth\s+knowing|subscribe\s+now|already\s+subscribed/i.test(text);
}

function liveMintByline(doc) {
  const preferredAuthors = [...doc.querySelectorAll('.authorDesc a')]
    .map((node) => cleanText(node.textContent))
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
  if (preferredAuthors.length) return preferredAuthors.join(" & ");

  const candidates = [
    ...doc.querySelectorAll('[itemprop="author"] [itemprop="name"], [itemprop="author"], [rel="author"], .story-author, .story-author-name, [class*="authorName"], [class*="articleInfo"][class*="author"]'),
    doc.querySelector('meta[name="author"]'),
  ]
    .map((node) => cleanText(node?.getAttribute?.("content") || node?.textContent || ""))
    .map((value) => value.replace(/^by\s+/i, "").trim())
    .filter((value) => value && value.length <= 100 && !/^mint$/i.test(value) && ! /about\s+the\s+author/i.test(value));

  const unique = candidates.filter((value, index, values) => values.indexOf(value) === index);
  return unique.length ? unique.join(" & ") : fixByline(doc, "").replace(/^mint$/i, "");
}

function cleanBlockClone(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll(HIDDEN_OR_CHROME.join(", ")).forEach((element) => element.remove());
  clone.querySelectorAll(".headingSecond").forEach((heading) => {
    const replacement = document.createElement("h2");
    replacement.innerHTML = heading.innerHTML;
    heading.replaceWith(replacement);
  });
  return clone;
}

function blockMarkup(node) {
  const clone = cleanBlockClone(node);
  const markup = clone.innerHTML.trim();
  const text = cleanText(clone.textContent);
  if (!text) return "";
  if (markup && /<\/?(?:p|h[2-6]|blockquote|ul|ol|figure|a|strong|b|em|i|u|code|br|sup|sub)\b/i.test(markup)) {
    return markup;
  }
  return `<p>${text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p>`;
}

function extractPublicBody(doc, url) {
  const bodyRoot = articleBodyRoot(doc);
  if (!bodyRoot) return null;
  const mainArea = bodyRoot.querySelector(".mainArea") || bodyRoot;
  const blocks = [...mainArea.querySelectorAll(".storyParagraph, .keytakeAway")]
    .filter((node) => !node.closest(".alsoRead"));

  const uniqueBlocks = blocks.filter((node, index, values) => {
    const text = cleanText(node.textContent);
    return text && values.findIndex((candidate) => candidate === node || cleanText(candidate.textContent) === text) === index;
  });

  let rawBody = uniqueBlocks.map(blockMarkup).filter(Boolean).join("");
  if (!rawBody) {
    const fallback = mainArea.cloneNode(true);
    fallback.querySelectorAll(HIDDEN_OR_CHROME.join(", ")).forEach((element) => element.remove());
    rawBody = fallback.innerHTML.trim();
  }
  if (!rawBody) return null;

  const content = sanitizeContent(rawBody, url);
  const textContent = textFromHtml(content);
  if (!textContent || textContent.length < 120) return null;
  return { bodyRoot, content, textContent };
}

export const liveMintAdapter = {
  ...createGenericPublisherAdapter("live-mint", ["livemint.com"]),
  matches: isLiveMintUrl,
  isArticleUrl: isLiveMintArticleUrl,
  preferPublisherCandidates: true,
  extractCandidates(doc, url) {
    if (!isLiveMintArticleUrl(url)) return [];
    const body = extractPublicBody(doc, url);
    if (!body) return [];

    const title = fixTitle(doc, "");
    const heroUrl = getHeroImageUrl(doc, url);
    const content = `${heroImage(doc, url, title)}${stripImageByIdentity(body.content, heroUrl, url)}`;
    const gated = hasVisibleAccessGate(body.bodyRoot);
    const excerpt = cleanText(
      doc.querySelector('meta[property="og:description"]')?.content
        || doc.querySelector('meta[name="description"]')?.content
        || body.textContent.slice(0, 240),
    );

    return [{
      title,
      byline: liveMintByline(doc),
      content,
      textContent: textFromHtml(content),
      excerpt,
      gated,
      _publisherSpecific: true,
      _strategy: "live-mint-structured",
    }];
  },
};

export { extractPublicBody, hasVisibleAccessGate, isLiveMintArticleUrl };
