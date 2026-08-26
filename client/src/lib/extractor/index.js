import { extractSmryArticle } from "../smry.js";
import { getPublisherAdapter } from "./registry.js";
import { genericAdapter } from "./generic-adapter.js";
import { fetchHtml, createExtractionError } from "./transport.js";
import { createId, readTime, sourceName } from "./metadata.js";
import { textFromHtml } from "./sanitize.js";
import { classifyPreview, scoreCandidate } from "./quality.js";
import { hasAccessGate } from "./paywall.js";

function parseDocument(html) {
  return new DOMParser().parseFromString(html, "text/html");
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function asArticle(candidate, url) {
  const textContent = candidate.textContent || textFromHtml(candidate.content || "");
  const accessGated = Boolean(candidate.gated)
    || hasAccessGate({ record: candidate._record, text: candidate.gated ? textContent : "" });
  const previewOnly = classifyPreview(candidate, { record: candidate._record }) || accessGated;
  return {
    id: createId(),
    url,
    title: candidate.title || "Untitled",
    byline: candidate.byline || sourceName(url),
    source: sourceName(url),
    content: candidate.content || "",
    textContent,
    excerpt: candidate.excerpt || textContent.slice(0, 240),
    readingMinutes: readTime(textContent),
    dateAdded: new Date().toISOString(),
    previewOnly,
    accessGated,
    strategy: candidate._strategy || "unknown",
    score: Math.round(candidate._score ?? scoreCandidate(candidate)),
  };
}

export async function extractArticle(url, options = {}) {
  let directArticle = null;
  let directError = null;
  const adapter = getPublisherAdapter(url);
  const startedAt = now();

  try {
    if (adapter.isArticleIndexUrl?.(url)) {
      throw createExtractionError("section_page", "This Economic Times page is an article index. Choose an individual article to save.");
    }

    const fetchStartedAt = now();
    const html = await fetchHtml(url, options);
    const fetchedAt = now();
    const parseStartedAt = fetchedAt;
    const doc = parseDocument(html);
    const parsedAt = now();
    const candidatesStartedAt = parsedAt;
    const candidates = [];

    if (adapter !== genericAdapter) {
      // A custom adapter supplies publisher-specific candidates first. Generic
      // Readability remains a safety net when the custom payload is only a teaser
      // or when the publisher changes its markup.
      for (const candidate of adapter.extractCandidates?.(doc, url, options) || []) {
        if (candidate) candidates.push(candidate);
      }
      for (const candidate of await adapter.extractCandidatesAsync?.(doc, url, options) || []) {
        if (candidate) candidates.push(candidate);
      }
    }
    for (const candidate of genericAdapter.extractCandidates(doc, url, options) || []) {
      if (candidate) candidates.push(candidate);
    }

    options.log?.("extract.timing", { totalMs: Math.round(now() - startedAt), fetchMs: Math.round(fetchedAt - fetchStartedAt), documentParseMs: Math.round(parsedAt - parseStartedAt), candidateMs: Math.round(now() - candidatesStartedAt), candidateCount: candidates.length, htmlBytes: html.length }, "debug");
    if (!candidates.length) throw createExtractionError("no_article", "Could not extract article content from this page.");
    const adapterGate = Boolean(adapter.detectAccessGate?.(doc));
    const shouldPreferPublisherCandidates = adapter.preferPublisherCandidates
      || (adapter.preferPublisherCandidatesWhenGated && adapterGate);
    const preferredCandidates = shouldPreferPublisherCandidates
      ? candidates.filter((candidate) => candidate._publisherSpecific)
      : candidates;
    const scored = (preferredCandidates.length ? preferredCandidates : candidates).map((candidate) => ({
      ...candidate,
      gated: Boolean(candidate.gated) || adapterGate,
      _score: scoreCandidate(candidate),
    }));
    scored.sort((left, right) => right._score - left._score);
    directArticle = asArticle(scored[0], url);
  } catch (error) {
    directError = error;
    options.log?.("extract.timing", { totalMs: Math.round(now() - startedAt), failed: true, error: error instanceof Error ? error.message : String(error) }, "debug");
    options.log?.("fetch.direct.failed", error instanceof Error ? error.message : "Direct extraction failed");
  }

  if (directArticle && !directArticle.previewOnly) return directArticle;
  if (directError?.code === "section_page") throw directError;

  try {
    options.log?.("fetch.smry.started", "Incomplete public result; trying smry agent extraction");
    const smryArticle = await extractSmryArticle(url, directArticle);
    const explicitGate = Boolean(directArticle?.accessGated);
    const article = {
      ...(directArticle || {}),
      ...smryArticle,
      id: directArticle?.id || createId(),
      url,
      source: smryArticle.source || directArticle?.source || sourceName(url),
      dateAdded: directArticle?.dateAdded || new Date().toISOString(),
      readingMinutes: readTime(smryArticle.textContent),
      previewOnly: Boolean(smryArticle.previewOnly) || explicitGate,
      accessGated: explicitGate,
      score: Math.round(scoreCandidate(smryArticle)),
    };
    options.log?.("fetch.smry.succeeded", `${smryArticle.provenance.blocks} blocks · ${smryArticle.textContent.length} characters`);
    return article;
  } catch (error) {
    options.log?.("fetch.smry.failed", error instanceof Error ? `${error.code || "error"} · ${error.message}` : "smry extraction failed");
  }

  if (directArticle) return directArticle;
  throw directError || new Error("Could not extract article. This site may require a subscription.");
}

export { fetchHtml };
