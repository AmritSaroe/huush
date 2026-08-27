package com.amritsaroe.huush.compose

import com.amritsaroe.huush.compose.data.NativeReadabilityExtractor
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class NativeReadabilityExtractorTest {
    @Test
    fun readabilityExtractsLongArticleAndCleansMarkup() {
        val paragraph = "India's trade outlook is changing as manufacturers diversify supply chains, improve logistics, and respond to new tariff conditions. This paragraph contains enough substantive public editorial text to represent a real article body rather than navigation or promotional copy."
        val html = """
            <html><head>
              <title>Fallback browser title</title>
              <meta property="og:title" content="Complete article title from metadata">
            </head><body>
              <nav>Recommended stories and menu links</nav>
              <article class="publisher-article" style="background:black" data-test="remove-me">
                <h1>First visible heading</h1>
                <p>$paragraph</p><p>$paragraph Two.</p><p>$paragraph Three.</p><p>$paragraph Four.</p><p>$paragraph Five.</p>
                <div class="subscribe-promo">Subscribe now to continue</div>
              </article>
            </body></html>
        """.trimIndent()

        val result = NativeReadabilityExtractor.extract("https://example.com/story", html)

        assertTrue(result != null)
        result!!
        assertFalse(result.previewOnly)
        assertFalse(result.accessGated)
        assertTrue(result.title == "Complete article title from metadata")
        assertTrue(result.paragraphs.size >= 5)
        assertTrue(result.contentHtml.contains("India's trade outlook"))
        assertFalse(result.contentHtml.contains("style="))
        assertFalse(result.contentHtml.contains("class="))
        assertFalse(result.contentHtml.contains("data-test"))
        assertFalse(result.contentHtml.contains("Subscribe now"))
    }

    @Test
    fun shortOrGatedContentRemainsPreviewOnly() {
        val html = """
            <html><body><article>
              <h1>Short story</h1>
              <p>This is a short public teaser with enough words to represent a real article body.</p>
              <p>Subscribe now to continue reading this premium content.</p>
            </article></body></html>
        """.trimIndent()

        val result = NativeReadabilityExtractor.extract("https://example.com/short", html)

        assertTrue(result != null)
        result!!
        assertTrue(result.previewOnly)
        assertTrue(result.accessGated)
    }
}
