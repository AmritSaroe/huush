import { cleanText, fixTitle, getHeroImageUrl, heroImage, stripImageByIdentity } from "../extractor/metadata.js";
import { sanitizeContent } from "../article-sanitizer.js";
import { textFromHtml } from "../extractor/sanitize.js";

const MONEYLIFE_HOSTS = new Set(["moneylife.in"]);
const ARTICLE_PATH = /^\/article\//i;
const BODY_SELECTORS = [
  '[class*="article_desc"]',
  '.main_article [class*="article_desc"]',
  '.artical-page .main_article [class*="article_desc"]',
];

function normalizedHost(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return "";
  }
}

export function isMoneylifeUrl(url) {
  try {
    const parsed = new URL(url);
    return MONEYLIFE_HOSTS.has(normalizedHost(url)) && ARTICLE_PATH.test(parsed.pathname);
  } catch {
    return false;
  }
}

function articleBodyRoot(doc) {
  return BODY_SELECTORS.map((selector) => doc?.querySelector(selector)).find(Boolean) || null;
}

function moneylifeByline(doc) {
  const meta = cleanText(doc.querySelector('meta[name="author"]')?.content || "");
  if (meta) return meta;

  const dated = doc.querySelector(".artical-dated__text");
  if (dated) {
    const text = cleanText(dated.textContent).replace(/\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b.*$/, "").trim();
    if (text) return text;
  }
  return cleanText(doc.querySelector(".artical-page .author, [class*='author']")?.textContent || "");
}

function isHeadingBlock(node) {
  const strong = node.children.length === 1 && node.firstElementChild?.tagName === "STRONG";
  const text = cleanText(node.textContent);
  return strong && text.length > 2 && text.length <= 140;
}

function buildArticleMarkup(source) {
  const output = document.createElement("div");
  [...source.children].forEach((node) => {
    const text = cleanText(node.textContent);
    const image = node.querySelector("img");
    if (!text && !image) return;

    if (image) {
      const figure = document.createElement("figure");
      figure.append(image.cloneNode(true));
      const caption = node.querySelector("figcaption, .caption")?.textContent;
      if (caption) {
        const figcaption = document.createElement("figcaption");
        figcaption.textContent = cleanText(caption);
        figure.append(figcaption);
      }
      output.append(figure);
      return;
    }

    if (isHeadingBlock(node)) {
      const heading = document.createElement("h2");
      heading.textContent = text;
      output.append(heading);
      return;
    }

    const paragraph = document.createElement("p");
    paragraph.innerHTML = node.innerHTML;
    output.append(paragraph);
  });
  return output.innerHTML;
}

function removePublisherNodes(root) {
  root.querySelectorAll("script, style, noscript, form, button, audio, source, video").forEach((node) => node.remove());
  root.querySelectorAll("a").forEach((link) => {
    if (/^(?:share|bookmark|sign\s*in|sign\s*up|listen)/i.test(cleanText(link.textContent))) link.remove();
  });
}

function extractBody(doc, url) {
  const source = articleBodyRoot(doc);
  if (!source) return null;
  const root = source.cloneNode(true);
  removePublisherNodes(root);
  const content = sanitizeContent(buildArticleMarkup(root), url);
  const textContent = textFromHtml(content);
  if (!textContent || textContent.length < 240) return null;
  return { content, textContent };
}

export const moneylifeAdapter = {
  id: "moneylife",
  matches: isMoneylifeUrl,
  preferPublisherCandidates: true,
  extractCandidates(doc, url) {
    if (!isMoneylifeUrl(url)) return [];
    const body = extractBody(doc, url);
    if (!body) return [];

    const title = fixTitle(doc, "");
    const heroUrl = getHeroImageUrl(doc, url);
    const content = `${heroImage(doc, url, title)}${stripImageByIdentity(body.content, heroUrl, url)}`;

    return [{
      title,
      byline: moneylifeByline(doc),
      content,
      textContent: textFromHtml(content),
      excerpt: body.textContent.slice(0, 240),
      gated: false,
      previewOnly: false,
      _publisherSpecific: true,
      _strategy: "moneylife-structured",
    }];
  },
};
