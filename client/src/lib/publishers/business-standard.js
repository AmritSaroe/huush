import { genericAdapter } from "../extractor/generic-adapter.js";
import { fixByline, fixTitle, getHeroImageUrl, heroImage, stripImageByIdentity, cleanText } from "../extractor/metadata.js";
import { escapeHtml, htmlFromPlainText, sanitizeHtml, textFromHtml } from "../extractor/sanitize.js";

const BUSINESS_STANDARD_HOSTS = new Set(["business-standard.com", "mybs.in"]);
const BODY_SELECTORS = [
  "#parent_top_div",
  ".MainStory_storycontent__Pe3ys",
  '[class*="storycontent"]',
];
const BLOCK_TAGS = new Set(["P", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "UL", "OL", "FIGURE"]);
const CHROME_SELECTORS = [
  "script",
  "style",
  "iframe",
  "noscript",
  ".storyautio",
  ".storyaudio",
  '[class*="storyautio"]',
  '[class*="audio"]',
  ".social-share",
  '[class*="social"]',
  '[class*="share"]',
  ".related-story",
  '[class*="related"]',
  '[class*="recommended"]',
  ".advertisement",
  '[class*="advert"]',
  ".paywall-cta",
  '[class*="subscribe"]',
  '[class*="login"]',
];

function normalizedHost(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
  } catch {
    return "";
  }
}

function isBusinessStandardUrl(url) {
  const host = normalizedHost(url);
  return [...BUSINESS_STANDARD_HOSTS].some((accepted) => host === accepted || host.endsWith(`.${accepted}`));
}

function hasExplicitAccessGate(doc) {
  const body = doc?.body?.cloneNode(true);
  body?.querySelectorAll("script, style, noscript").forEach((element) => element.remove());
  const visibleText = cleanText(body?.textContent || "");
  // Business Standard’s JSON-LD marks the commercial product as not freely
  // accessible even when the complete article body is present in public DOM
  // slots. Only visible, unambiguous reader-facing gate text is trusted here.
  return /subscription required|sign in to read|subscribe to continue|unlock this article|get full access|read this story with a subscription/i.test(visibleText);
}

function meaningfulText(node) {
  return cleanText(node?.textContent || "");
}

function unwrapDivs(node) {
  node.querySelectorAll("div").forEach((wrapper) => {
    wrapper.replaceWith(...Array.from(wrapper.childNodes));
  });
}

function cleanClone(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll(CHROME_SELECTORS.join(",")).forEach((element) => element.remove());
  clone.querySelectorAll("small.brtag, .brtag").forEach((element) => element.remove());
  unwrapDivs(clone);
  return clone;
}

function markupAsBlocks(node) {
  const clone = cleanClone(node);
  const richBlocks = Array.from(clone.children).filter((child) => BLOCK_TAGS.has(child.tagName));
  if (richBlocks.length) return richBlocks.map((block) => block.outerHTML).join("");

  const markup = clone.innerHTML.trim();
  const text = meaningfulText(clone);
  if (!text) return "";
  if (markup && /<\/?(?:a|strong|b|em|i|u|code|br|sup|sub)\b/i.test(markup)) {
    return `<p>${markup}</p>`;
  }
  return `<p>${escapeHtml(text)}</p>`;
}

function appendBodyBlocks(target, bodyRoot) {
  const nonPaywall = bodyRoot.querySelector(".non-paywall-content");
  if (nonPaywall) target.insertAdjacentHTML("beforeend", markupAsBlocks(nonPaywall));

  const slots = Array.from(bodyRoot.querySelectorAll(".paywall-content .paywall-slot, .paywall-slot"));
  if (slots.length) {
    slots.forEach((slot) => target.insertAdjacentHTML("beforeend", markupAsBlocks(slot)));
  } else {
    const fallback = bodyRoot.querySelector(".paywall-content");
    if (fallback) target.insertAdjacentHTML("beforeend", markupAsBlocks(fallback));
  }
}

function fallbackBodyFromJsonLd(doc) {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent || "");
      const records = Array.isArray(parsed) ? parsed : [parsed];
      for (const record of records) {
        if (typeof record?.articleBody === "string" && cleanText(record.articleBody).length >= 200) {
          return htmlFromPlainText(record.articleBody);
        }
      }
    } catch {
      // Ignore malformed structured data and continue with the DOM candidates.
    }
  }
  return "";
}

function captionMarkup(doc) {
  const caption = cleanText(doc.querySelector('[class*="captiontext"], .captiontext')?.textContent || "");
  return caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "";
}

function extractBusinessStandardCandidate(doc, url) {
  const bodyRoot = BODY_SELECTORS.map((selector) => doc.querySelector(selector)).find(Boolean);
  const bodyContainer = doc.createElement("div");
  if (bodyRoot) appendBodyBlocks(bodyContainer, bodyRoot);

  let rawBody = bodyContainer.innerHTML;
  if (!textFromHtml(rawBody) || textFromHtml(rawBody).length < 200) rawBody = fallbackBodyFromJsonLd(doc);
  if (!rawBody) return null;

  const content = sanitizeHtml(rawBody, url);
  const textContent = textFromHtml(content);
  if (!textContent || textContent.length < 200) return null;

  const title = fixTitle(doc, "");
  const author = cleanText(
    doc.querySelector('[class*="dtlauthinfo"] a, [class*="author"] a, .storydetail [data-author]')?.textContent || "",
  );
  const byline = author || fixByline(doc, "");
  const hero = heroImage(doc, url, title);
  const caption = captionMarkup(doc);
  const heroWithCaption = caption && hero ? hero.replace("</figure>", `${caption}</figure>`) : hero;

  return {
    title,
    byline,
    content: `${heroWithCaption}${stripImageByIdentity(content, getHeroImageUrl(doc, url), url)}`,
    textContent,
    excerpt: cleanText(doc.querySelector('meta[property="og:description"]')?.content || textContent.slice(0, 240)),
    // Business Standard currently exposes the complete editorial body in public
    // div slots whose class name contains "paywall". We use only what is present
    // in the anonymous response; the class name alone is not an access gate.
    gated: hasExplicitAccessGate(doc),
    _publisherSpecific: true,
    _strategy: "business-standard-structured",
  };
}

export const businessStandardAdapter = {
  id: "business-standard",
  matches: isBusinessStandardUrl,
  extractCandidates(doc, url) {
    const candidate = extractBusinessStandardCandidate(doc, url);
    return candidate ? [candidate] : [];
  },
  fallback: genericAdapter,
};

export { extractBusinessStandardCandidate };
