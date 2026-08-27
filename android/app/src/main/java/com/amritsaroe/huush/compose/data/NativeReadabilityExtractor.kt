package com.amritsaroe.huush.compose.data

import net.dankito.readability4j.extended.Readability4JExtended
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.jsoup.nodes.Element
import java.util.Locale

private val accessGatePhrases = listOf(
    "subscribe now",
    "subscription required",
    "please log in",
    "sign in to read",
    "premium content",
    "continue reading",
    "exclusive story",
    "limited access",
    "get full access",
    "sign up to read",
    "unlock this article",
    "subscribe to continue",
    "read this story with a subscription",
)

private val excludedTextPrefixes = Regex("^(related|also read|trending|recommended|advertisement|copyright|disclaimer)\\b", RegexOption.IGNORE_CASE)

internal data class ReadableExtraction(
    val title: String,
    val byline: String,
    val excerpt: String,
    val contentHtml: String,
    val paragraphs: List<String>,
    val previewOnly: Boolean,
    val accessGated: Boolean,
    val score: Int,
)

internal object NativeReadabilityExtractor {
    fun extract(url: String, html: String): ReadableExtraction? {
        val sourceDocument = Jsoup.parse(html, url)
        val parsed = runCatching { Readability4JExtended(url, html).parse() }.getOrNull()
        val readabilityHtml = parsed?.content?.takeIf(String::isNotBlank)
        val sanitized = sanitize(readabilityHtml ?: html, url).ifBlank {
            sanitize(html, url)
        }
        if (sanitized.isBlank()) return null

        val contentDocument = Jsoup.parseBodyFragment(sanitized, url)
        val paragraphs = collectBlocks(contentDocument)
        val parsedText = cleanText(parsed?.textContent.orEmpty())
        val sourceArticleText = cleanText(sourceDocument.selectFirst("article,[itemprop=articleBody],main")?.text().orEmpty())
        val sourceText = cleanText(sourceDocument.body()?.text().orEmpty())
        val sourceArticleBlocks = splitText(sourceArticleText).ifEmpty {
            if (sourceArticleText.length >= 20) listOf(sourceArticleText) else emptyList()
        }
        val parsedBlocks = splitText(parsedText).ifEmpty {
            if (parsedText.length >= 40) listOf(parsedText) else emptyList()
        }
        val sourceBlocks = splitText(sourceText).ifEmpty {
            if (sourceText.length >= 40) listOf(sourceText) else emptyList()
        }
        val fallbackBlocks = when {
            paragraphs.size >= 2 -> paragraphs
            parsedBlocks.isNotEmpty() -> parsedBlocks
            sourceArticleBlocks.isNotEmpty() -> sourceArticleBlocks
            sourceBlocks.isNotEmpty() -> sourceBlocks
            else -> emptyList()
        }
        val text = fallbackBlocks.joinToString(" ").trim()
        if (text.length < 20) return null

        val accessGated = htmlHasAccessGate(sourceDocument.html()) || textHasAccessGate(text)
        val previewOnly = accessGated || text.length < 1200 || fallbackBlocks.size < 3
        val title = firstNonBlank(
            sourceDocument.selectFirst("meta[property=og:title]")?.attr("content"),
            sourceDocument.selectFirst("meta[name=twitter:title]")?.attr("content"),
            sourceDocument.selectFirst("h1")?.text(),
            parsed?.title,
            sourceDocument.title(),
        ) ?: "Untitled article"
        val byline = firstNonBlank(
            sourceDocument.selectFirst("meta[name=author]")?.attr("content"),
            sourceDocument.selectFirst("[rel=author]")?.text(),
            parsed?.byline,
        ).orEmpty()
        val score = score(text, sanitized, title, byline)

        return ReadableExtraction(
            title = cleanText(title),
            byline = cleanText(byline),
            excerpt = firstNonBlank(parsed?.excerpt, text.take(240)).orEmpty(),
            contentHtml = sanitized,
            paragraphs = fallbackBlocks,
            previewOnly = previewOnly,
            accessGated = accessGated,
            score = score,
        )
    }

    private fun collectBlocks(document: Document): List<String> {
        val seen = linkedSetOf<String>()
        return document.select("p,h2,h3,h4,blockquote,li")
            .map { cleanText(it.text()) }
            .filter { block ->
                block.length >= 40 &&
                    !excludedTextPrefixes.containsMatchIn(block) &&
                    seen.add(block)
            }
    }

    private fun splitText(text: String): List<String> = text
        .split(Regex("(?<=[.!?])\\s{2,}|\\n{2,}"))
        .map(::cleanText)
        .filter { it.length >= 40 }
        .distinct()

    private fun sanitize(rawHtml: String, baseUrl: String): String {
        val document = Jsoup.parseBodyFragment(rawHtml, baseUrl)
        document.select("script,style,noscript,template,form,nav,header,footer,aside,iframe,button,dialog").remove()
        document.select("[class*=subscribe],[id*=subscribe],[class*=paywall],[id*=paywall],[class*=advert],[id*=advert],[class*=promo],[id*=promo]")
            .filter { it.text().length < 900 || textHasAccessGate(it.text()) }
            .forEach(Element::remove)
        document.select("p,div,section,aside,span")
            .filter { it.text().length < 900 && textHasAccessGate(it.text()) }
            .forEach(Element::remove)
        document.select("*").forEach { element ->
            element.attributes().asList().toList().forEach { attribute ->
                val key = attribute.key.lowercase(Locale.US)
                if (key == "style" || key == "class" || key == "id" || key.startsWith("data-") || key.startsWith("on")) {
                    element.removeAttr(attribute.key)
                }
            }
            element.select("a[href]").forEach { link ->
                link.attr("href", link.absUrl("href"))
            }
            element.select("img[src]").forEach { image ->
                image.attr("src", image.absUrl("src"))
            }
        }
        return document.body().html()
    }

    private fun score(text: String, html: String, title: String, byline: String): Int {
        var score = (text.length * 0.6f).toInt()
        score += Regex("<p\\b", RegexOption.IGNORE_CASE).findAll(html).count() * 120
        score += Regex("<h[2-6]\\b", RegexOption.IGNORE_CASE).findAll(html).count() * 60
        score += Regex("<li\\b", RegexOption.IGNORE_CASE).findAll(html).count() * 20
        if (title.length > 15) score += 250
        if (byline.isNotBlank()) score += 80
        accessGatePhrases.forEach { phrase -> if (text.lowercase(Locale.US).contains(phrase)) score -= 400 }
        return score
    }

    private fun firstNonBlank(vararg values: String?): String? = values
        .asSequence()
        .mapNotNull { it?.trim()?.takeIf(String::isNotBlank) }
        .firstOrNull()

    private fun cleanText(text: String): String = text.replace(Regex("\\s+"), " ").trim()

    private fun textHasAccessGate(text: String): Boolean {
        val lower = text.lowercase(Locale.US)
        return accessGatePhrases.any(lower::contains)
    }

    private fun htmlHasAccessGate(html: String): Boolean = Regex(
        "etprimeblocker|etprime-blocker|subscription required|[\\\"']isAccessibleForFree[\\\"']\\s*[:=]\\s*(?:false|[\\\"']false[\\\"'])",
        RegexOption.IGNORE_CASE,
    ).containsMatchIn(html)
}
