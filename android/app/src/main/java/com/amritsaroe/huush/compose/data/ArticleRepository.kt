package com.amritsaroe.huush.compose.data

import android.content.Context
import android.net.Uri
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import org.jsoup.Jsoup
import java.util.Locale

private val Context.huushDataStore by preferencesDataStore(name = "huush_native")

private object PreferenceKeys {
    val articles = stringPreferencesKey("articles")
    val settings = stringPreferencesKey("settings")
}

data class Article(
    val id: String,
    val title: String,
    val source: String,
    val url: String,
    val summary: String,
    val paragraphs: List<String>,
    val previewOnly: Boolean,
    val addedAt: Long = System.currentTimeMillis(),
)

data class NativeSettings(
    val theme: String = "system",
    val font: String = "source-serif-4",
    val fontSize: Int = 18,
)

class ArticleRepository(private val context: Context) {
    val articles: Flow<List<Article>> = context.huushDataStore.data
        .map { preferences -> decodeArticles(preferences[PreferenceKeys.articles]) }
        .catch { emit(emptyList()) }

    val settings: Flow<NativeSettings> = context.huushDataStore.data
        .map { preferences -> decodeSettings(preferences[PreferenceKeys.settings]) }
        .catch { emit(NativeSettings()) }

    suspend fun saveArticle(article: Article) {
        context.huushDataStore.edit { preferences ->
            val current = decodeArticles(preferences[PreferenceKeys.articles]).toMutableList()
            current.removeAll { it.id == article.id }
            preferences[PreferenceKeys.articles] = encodeArticles(listOf(article) + current)
        }
    }

    suspend fun deleteArticle(articleId: String) {
        context.huushDataStore.edit { preferences ->
            val current = decodeArticles(preferences[PreferenceKeys.articles])
            preferences[PreferenceKeys.articles] = encodeArticles(current.filterNot { it.id == articleId })
        }
    }

    suspend fun updateSettings(settings: NativeSettings) {
        context.huushDataStore.edit { preferences ->
            preferences[PreferenceKeys.settings] = JSONObject()
                .put("theme", settings.theme)
                .put("font", settings.font)
                .put("fontSize", settings.fontSize)
                .toString()
        }
    }

    suspend fun fetchPublicArticle(rawUrl: String): Result<Article> = withContext(Dispatchers.IO) {
        runCatching {
            val url = normalizeUrl(rawUrl)
            val document = Jsoup.connect(url)
                .userAgent("Huush/0.1 (+public article reader)")
                .referrer("https://www.google.com/")
                .timeout(15_000)
                .followRedirects(true)
                .get()

            val title = sequenceOf(
                document.selectFirst("meta[property=og:title]")?.attr("content"),
                document.selectFirst("meta[name=twitter:title]")?.attr("content"),
                document.selectFirst("h1")?.text(),
                document.title(),
            ).mapNotNull { it?.trim()?.takeIf(String::isNotBlank) }.firstOrNull()
                ?: "Untitled article"

            val root = document.selectFirst("article")
                ?: document.selectFirst("main")
                ?: document.body()
                ?: error("The page has no readable body")

            root.select("script,style,noscript,template,form,nav,header,footer,aside,iframe,button,dialog").remove()
            val blocks = root.select("p,h2,h3,blockquote,li")
                .map { it.text().replace(Regex("\\s+"), " ").trim() }
                .filter { it.length >= 24 }
                .distinct()
            val paragraphs = if (blocks.isNotEmpty()) blocks else root.text()
                .split(Regex("(?<=[.!?])\\s{2,}"))
                .map(String::trim)
                .filter { it.length >= 24 }

            val characterCount = paragraphs.sumOf(String::length)
            val previewOnly = paragraphs.size < 3 || characterCount < 1200
            val source = sourceName(Uri.parse(url).host.orEmpty())
            Article(
                id = url,
                title = title,
                source = source,
                url = url,
                summary = paragraphs.take(2).joinToString(" ").take(360),
                paragraphs = paragraphs,
                previewOnly = previewOnly,
            )
        }
    }

    private fun normalizeUrl(rawUrl: String): String {
        val candidate = rawUrl.trim().let { if (it.startsWith("http://") || it.startsWith("https://")) it else "https://$it" }
        val parsed = Uri.parse(candidate)
        require(parsed.scheme?.lowercase(Locale.US) in setOf("http", "https") && !parsed.host.isNullOrBlank()) {
            "Enter a valid public http or https URL."
        }
        return parsed.toString()
    }

    private fun sourceName(host: String): String {
        val label = host.removePrefix("www.").substringBefore('.').replace('-', ' ')
        return label.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.US) else it.toString() }.ifBlank { "Web article" }
    }
}

private fun encodeArticles(articles: List<Article>): String = JSONArray().apply {
    articles.forEach { article ->
        put(JSONObject()
            .put("id", article.id)
            .put("title", article.title)
            .put("source", article.source)
            .put("url", article.url)
            .put("summary", article.summary)
            .put("paragraphs", JSONArray(article.paragraphs))
            .put("previewOnly", article.previewOnly)
            .put("addedAt", article.addedAt))
    }
}.toString()

private fun decodeArticles(raw: String?): List<Article> {
    if (raw.isNullOrBlank()) return emptyList()
    return runCatching {
        val json = JSONArray(raw)
        buildList {
            for (index in 0 until json.length()) {
                val item = json.optJSONObject(index) ?: continue
                val content = item.optJSONArray("paragraphs")?.let { array ->
                    buildList { for (paragraphIndex in 0 until array.length()) add(array.optString(paragraphIndex)) }
                }.orEmpty()
                add(Article(
                    id = item.optString("id"),
                    title = item.optString("title", "Untitled article"),
                    source = item.optString("source", "Web article"),
                    url = item.optString("url"),
                    summary = item.optString("summary"),
                    paragraphs = content,
                    previewOnly = item.optBoolean("previewOnly", false),
                    addedAt = item.optLong("addedAt", System.currentTimeMillis()),
                ))
            }
        }
    }.getOrDefault(emptyList())
}

private fun decodeSettings(raw: String?): NativeSettings {
    if (raw.isNullOrBlank()) return NativeSettings()
    return runCatching {
        val json = JSONObject(raw)
        NativeSettings(
            theme = json.optString("theme", "system"),
            font = json.optString("font", "source-serif-4"),
            fontSize = json.optInt("fontSize", 18).coerceIn(14, 24),
        )
    }.getOrDefault(NativeSettings())
}
