import { blockCount, textFromHtml } from "./sanitize.js";
import { PAYWALL_PHRASES, hasAccessGate } from "./paywall.js";

export const QUALITY_CONFIG = {
  MIN_CHARS: 1200,
  MIN_PARAGRAPHS: 3,
};

export function scoreCandidate(article) {
  if (!article || !article.textContent) return -Infinity;
  const text = article.textContent;
  const html = article.content || "";
  let score = text.length * 0.6;
  score += (html.match(/<p\b/gi) || []).length * 120;
  score += (html.match(/<h[2-6]\b/gi) || []).length * 60;
  score += (html.match(/<li\b/gi) || []).length * 20;
  score += article.title?.length > 15 ? 250 : 0;
  score += article.byline ? 80 : 0;
  const lower = text.toLowerCase();
  PAYWALL_PHRASES.forEach((phrase) => {
    if (lower.includes(phrase)) score -= 400;
  });
  return score;
}

export function isLowQuality(article, config = QUALITY_CONFIG) {
  if (!article) return true;
  const text = article.textContent || textFromHtml(article.content || "");
  return text.length < config.MIN_CHARS || blockCount(article.content || "") < config.MIN_PARAGRAPHS;
}

export function classifyPreview(article, { record = null } = {}) {
  if (!article) return true;
  return Boolean(article.previewOnly)
    || Boolean(article.gated)
    || isLowQuality(article)
    || hasAccessGate({ record, text: article.gated ? article.textContent || "" : "" });
}

export function bestCandidate(candidates = []) {
  return [...candidates]
    .filter(Boolean)
    .sort((left, right) => (right._score ?? scoreCandidate(right)) - (left._score ?? scoreCandidate(left)))[0] || null;
}
