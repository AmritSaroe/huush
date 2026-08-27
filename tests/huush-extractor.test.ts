import { afterEach, describe, expect, it, vi } from "vitest";

import { extractPublicArticle } from "../server/huush-extractor";

function page(body: string, title = "Document title") {
  return `<!doctype html><html><head><title>${title}</title><meta property="og:title" content="A complete article title from metadata"></head><body><article><h1>Short visible heading</h1>${body}</article></body></html>`;
}

function response(html: string) {
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

describe("Huush Readability extraction", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses metadata title fallback and classifies a complete public article as saveable", async () => {
    const paragraphs = Array.from({ length: 6 }, (_, index) => `<p>Paragraph ${index + 1}: ${"A complete public article has enough substantive words to remain readable and useful offline. ".repeat(4)}</p>`).join("");
    vi.stubGlobal("fetch", vi.fn(async () => response(page(paragraphs))));
    const result = await extractPublicArticle("https://example.com/story");
    expect(result.title).toBe("A complete article title from metadata");
    expect(result.content).toHaveLength(6);
    expect(result.previewOnly).toBe(false);
    expect(result.accessGated).toBe(false);
  });

  it("keeps short gated content as preview-only instead of treating it as a saved full article", async () => {
    const preview = `<p>This publisher preview gives a short visible introduction but asks readers to subscribe to continue reading the complete analysis.</p>${"<!-- publisher document padding -->".repeat(24)}`;
    vi.stubGlobal("fetch", vi.fn(async () => response(page(preview))));
    const result = await extractPublicArticle("https://example.com/premium-story");
    expect(result.previewOnly).toBe(true);
    expect(result.accessGated).toBe(true);
  });
});
