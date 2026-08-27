package com.amritsaroe.huush.compose

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.amritsaroe.huush.compose.data.Article
import com.amritsaroe.huush.compose.data.ArticleRepository
import com.amritsaroe.huush.compose.data.NativeSettings
import com.amritsaroe.huush.compose.ui.ReaderTheme
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private const val SYSTEM_THEME = "system"

enum class HuushDestination {
    Library,
    Tags,
    Settings,
    Reader,
}

data class HuushUiState(
    val destination: HuushDestination = HuushDestination.Library,
    val articles: List<Article> = emptyList(),
    val selectedArticle: Article? = null,
    val searchQuery: String = "",
    val captureSheetOpen: Boolean = false,
    val captureUrl: String = "",
    val isFetching: Boolean = false,
    val errorMessage: String? = null,
    val toastMessage: String? = null,
    val settings: NativeSettings = NativeSettings(),
)

class HuushViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = ArticleRepository(application)
    private val _uiState = MutableStateFlow(HuushUiState())
    val uiState: StateFlow<HuushUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            repository.articles.collect { articles -> _uiState.update { it.copy(articles = articles) } }
        }
        viewModelScope.launch {
            repository.settings.collect { settings -> _uiState.update { it.copy(settings = settings) } }
        }
    }

    fun selectDestination(destination: HuushDestination) {
        _uiState.update { it.copy(destination = destination, selectedArticle = null, errorMessage = null) }
    }

    fun openArticle(article: Article) {
        _uiState.update { it.copy(destination = HuushDestination.Reader, selectedArticle = article, errorMessage = null) }
    }

    fun closeReader() {
        _uiState.update { it.copy(destination = HuushDestination.Library, selectedArticle = null) }
    }

    fun setSearchQuery(value: String) {
        _uiState.update { it.copy(searchQuery = value) }
    }

    fun openCapture() {
        _uiState.update { it.copy(captureSheetOpen = true, captureUrl = "", errorMessage = null) }
    }

    fun closeCapture() {
        _uiState.update { it.copy(captureSheetOpen = false, captureUrl = "", errorMessage = null) }
    }

    fun setCaptureUrl(value: String) {
        _uiState.update { it.copy(captureUrl = value, errorMessage = null) }
    }

    fun fetchAndOpen() {
        val url = _uiState.value.captureUrl.trim()
        if (url.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Paste a public article URL first.") }
            return
        }
        if (_uiState.value.isFetching) return
        viewModelScope.launch {
            _uiState.update { it.copy(isFetching = true, errorMessage = null) }
            repository.fetchPublicArticle(url)
                .onSuccess { article ->
                    if (!article.previewOnly) repository.saveArticle(article)
                    _uiState.update {
                        it.copy(
                            isFetching = false,
                            captureSheetOpen = false,
                            captureUrl = "",
                            destination = HuushDestination.Reader,
                            selectedArticle = article,
                            toastMessage = if (article.previewOnly) "Preview only — not saved." else "Saved to your reading shelf.",
                        )
                    }
                }
                .onFailure { error ->
                    _uiState.update { it.copy(isFetching = false, errorMessage = error.message ?: "Could not read this public page.") }
                }
        }
    }

    fun saveSelectedArticle() {
        val article = _uiState.value.selectedArticle ?: return
        if (article.previewOnly) {
            _uiState.update { it.copy(toastMessage = "Preview only — not saved.") }
            return
        }
        viewModelScope.launch {
            repository.saveArticle(article.copy(previewOnly = false))
            _uiState.update { it.copy(selectedArticle = article.copy(previewOnly = false), toastMessage = "Saved to your reading shelf.") }
        }
    }

    fun deleteArticle(article: Article) {
        viewModelScope.launch {
            repository.deleteArticle(article.id)
            if (_uiState.value.selectedArticle?.id == article.id) closeReader()
            _uiState.update { it.copy(toastMessage = "Article removed.") }
        }
    }

    fun setTheme(theme: ReaderTheme) {
        val stored = when (theme) {
            ReaderTheme.Light -> "light"
            ReaderTheme.Dark -> "dark"
            ReaderTheme.Sepia -> "sepia"
        }
        updateSettings { copy(theme = stored) }
    }

    fun setSystemTheme() = updateSettings { copy(theme = SYSTEM_THEME) }

    fun setFont(font: String) = updateSettings { copy(font = font) }

    fun setFontSize(size: Int) = updateSettings { copy(fontSize = size.coerceIn(14, 24)) }

    fun consumeToast() {
        _uiState.update { it.copy(toastMessage = null) }
    }

    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    private fun updateSettings(transform: NativeSettings.() -> NativeSettings) {
        val updated = transform(_uiState.value.settings)
        _uiState.update { it.copy(settings = updated) }
        viewModelScope.launch { repository.updateSettings(updated) }
    }
}
