package com.amritsaroe.huush.compose.ui

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.BackHandler
import android.app.Activity
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.BookmarkBorder
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Label
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AssistChip
import androidx.compose.material3.BottomAppBar
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.amritsaroe.huush.compose.HuushDestination
import com.amritsaroe.huush.compose.HuushUiState
import com.amritsaroe.huush.compose.HuushViewModel
import com.amritsaroe.huush.compose.data.Article
import com.amritsaroe.huush.compose.data.NativeSettings
import kotlinx.coroutines.launch

@Composable
fun HuushRoot(viewModel: HuushViewModel = viewModel()) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val systemDark = androidx.compose.foundation.isSystemInDarkTheme()
    val readerTheme = when (uiState.settings.theme) {
        "dark" -> ReaderTheme.Dark
        "sepia" -> ReaderTheme.Sepia
        "light" -> ReaderTheme.Light
        else -> systemReaderTheme(systemDark)
    }
    val view = LocalView.current
    SideEffect {
        val activity = view.context as? Activity ?: return@SideEffect
        val controller = WindowCompat.getInsetsController(activity.window, view)
        val lightIcons = readerTheme != ReaderTheme.Dark
        controller.isAppearanceLightStatusBars = lightIcons
        controller.isAppearanceLightNavigationBars = lightIcons
    }

    HuushTheme(theme = readerTheme) {
        HuushApp(uiState = uiState, viewModel = viewModel)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HuushApp(uiState: HuushUiState, viewModel: HuushViewModel) {
    val snackbarHostState = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()

    BackHandler(enabled = uiState.captureSheetOpen || uiState.destination == HuushDestination.Reader) {
        if (uiState.captureSheetOpen) viewModel.closeCapture() else viewModel.closeReader()
    }

    LaunchedEffect(uiState.toastMessage) {
        uiState.toastMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.consumeToast()
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(hostState = snackbarHostState) },
        bottomBar = {
            if (uiState.destination != HuushDestination.Reader) {
                NativeBottomNavigation(
                    destination = uiState.destination,
                    onDestinationSelected = viewModel::selectDestination,
                )
            }
        },
    ) { innerPadding ->
        when (uiState.destination) {
            HuushDestination.Library -> LibraryScreen(
                modifier = Modifier.padding(innerPadding),
                uiState = uiState,
                onSearchChanged = viewModel::setSearchQuery,
                onOpenArticle = viewModel::openArticle,
                onDeleteArticle = viewModel::deleteArticle,
                onOpenCapture = viewModel::openCapture,
            )
            HuushDestination.Tags -> TagsScreen(modifier = Modifier.padding(innerPadding))
            HuushDestination.Settings -> SettingsScreen(
                modifier = Modifier.padding(innerPadding),
                settings = uiState.settings,
                onThemeSelected = viewModel::setTheme,
                onSystemThemeSelected = viewModel::setSystemTheme,
                onFontSelected = viewModel::setFont,
                onFontSizeChanged = viewModel::setFontSize,
            )
            HuushDestination.Reader -> ReaderScreen(
                modifier = Modifier.padding(innerPadding),
                article = uiState.selectedArticle,
                onBack = viewModel::closeReader,
                onSave = viewModel::saveSelectedArticle,
                onDelete = viewModel::deleteArticle,
            )
        }
    }

    if (uiState.captureSheetOpen) {
        CaptureSheet(
            uiState = uiState,
            onUrlChanged = viewModel::setCaptureUrl,
            onFetch = viewModel::fetchAndOpen,
            onDismiss = viewModel::closeCapture,
        )
    }
}

@Composable
private fun NativeBottomNavigation(
    destination: HuushDestination,
    onDestinationSelected: (HuushDestination) -> Unit,
) {
    NavigationBar(
        modifier = Modifier.navigationBarsPadding(),
        containerColor = MaterialTheme.colorScheme.background,
        tonalElevation = 0.dp,
    ) {
        val items = listOf(
            Triple(HuushDestination.Library, Icons.Default.Home, "Library"),
            Triple(HuushDestination.Tags, Icons.Default.Label, "Tags"),
            Triple(HuushDestination.Settings, Icons.Default.Settings, "Settings"),
        )
        items.forEach { (item, icon, label) ->
            NavigationBarItem(
                selected = destination == item,
                onClick = { onDestinationSelected(item) },
                icon = { Icon(icon, contentDescription = label) },
                label = { Text(label) },
            )
        }
    }
}

@Composable
private fun LibraryScreen(
    modifier: Modifier = Modifier,
    uiState: HuushUiState,
    onSearchChanged: (String) -> Unit,
    onOpenArticle: (Article) -> Unit,
    onDeleteArticle: (Article) -> Unit,
    onOpenCapture: () -> Unit,
) {
    val filteredArticles = remember(uiState.articles, uiState.searchQuery) {
        val query = uiState.searchQuery.trim().lowercase()
        if (query.isBlank()) uiState.articles else uiState.articles.filter {
            it.title.lowercase().contains(query) || it.source.lowercase().contains(query)
        }
    }
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .statusBarsPadding()
            .padding(horizontal = 20.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(top = 18.dp, bottom = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Text("huush", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(8.dp))
            Text("A quiet shelf for things worth keeping.", style = MaterialTheme.typography.headlineLarge)
            Spacer(Modifier.height(8.dp))
            Text(
                "Save public articles, then read them without the noise.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        item {
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = onSearchChanged,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    if (uiState.searchQuery.isNotEmpty()) {
                        IconButton(onClick = { onSearchChanged("") }) {
                            Icon(Icons.Default.Close, contentDescription = "Clear search")
                        }
                    }
                },
                placeholder = { Text("Search your shelf") },
            )
        }
        if (filteredArticles.isEmpty()) {
            item { EmptyLibrary(onOpenCapture = onOpenCapture) }
        } else {
            items(filteredArticles, key = { it.id }) { article ->
                ArticleCard(
                    article = article,
                    onOpen = { onOpenArticle(article) },
                    onDelete = { onDeleteArticle(article) },
                )
            }
        }
    }
}

@Composable
private fun EmptyLibrary(onOpenCapture: () -> Unit) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(22.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Your shelf is clear.", style = MaterialTheme.typography.titleLarge)
            Text(
                "Paste a public article URL to create your first calm reading copy.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(onClick = onOpenCapture) {
                Icon(Icons.Default.Add, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Add article")
            }
        }
    }
}

@Composable
private fun ArticleCard(article: Article, onOpen: () -> Unit, onDelete: () -> Unit) {
    Card(
        onClick = onOpen,
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    article.source,
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.weight(1f),
                )
                IconButton(onClick = onDelete) {
                    Icon(Icons.Default.DeleteOutline, contentDescription = "Delete article")
                }
            }
            Text(
                article.title,
                style = MaterialTheme.typography.titleLarge,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                article.summary.ifBlank { "No summary available." },
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            if (article.previewOnly) {
                AssistChip(onClick = onOpen, label = { Text("Preview only") })
            }
        }
    }
}

@Composable
private fun TagsScreen(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .statusBarsPadding()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Tags", style = MaterialTheme.typography.headlineLarge)
        Text(
            "Collections will stay deliberately simple in the native foundation.",
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
            Text("No tags yet.", modifier = Modifier.padding(20.dp))
        }
    }
}

@Composable
private fun SettingsScreen(
    modifier: Modifier = Modifier,
    settings: NativeSettings,
    onThemeSelected: (ReaderTheme) -> Unit,
    onSystemThemeSelected: () -> Unit,
    onFontSelected: (String) -> Unit,
    onFontSizeChanged: (Int) -> Unit,
) {
    var sliderValue by rememberSaveable(settings.fontSize) { mutableFloatStateOf(settings.fontSize.toFloat()) }
    LaunchedEffect(settings.fontSize) { sliderValue = settings.fontSize.toFloat() }
    val themeChoices = listOf(
        "light" to ReaderTheme.Light,
        "dark" to ReaderTheme.Dark,
        "sepia" to ReaderTheme.Sepia,
    )
    val fontChoices = listOf("inter" to "Inter", "source-serif-4" to "Source Serif 4", "merriweather" to "Merriweather", "literata" to "Literata")
    LazyColumn(
        modifier = modifier
            .fillMaxSize()
            .statusBarsPadding()
            .padding(horizontal = 20.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(top = 18.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item {
            Text("Settings", style = MaterialTheme.typography.headlineLarge)
            Spacer(Modifier.height(6.dp))
            Text("Tune the reading room, not the noise.", color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        item {
            SettingSectionTitle("Theme")
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                themeChoices.forEach { (id, theme) ->
                    FilterChip(
                        selected = settings.theme == id,
                        onClick = { onThemeSelected(theme) },
                        label = { Text(theme.label) },
                    )
                }
                FilterChip(
                    selected = settings.theme == "system",
                    onClick = onSystemThemeSelected,
                    label = { Text("System") },
                )
            }
        }
        item {
            SettingSectionTitle("Reading size")
            Text("${sliderValue.toInt()} sp", style = MaterialTheme.typography.titleMedium)
            Slider(
                value = sliderValue,
                onValueChange = { sliderValue = it },
                onValueChangeFinished = { onFontSizeChanged(sliderValue.toInt()) },
                valueRange = 14f..24f,
                steps = 9,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        item {
            SettingSectionTitle("Reading font")
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                fontChoices.forEach { (id, label) ->
                    val selected = settings.font == id
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .selectable(
                                selected = selected,
                                onClick = { onFontSelected(id) },
                                role = Role.RadioButton,
                            )
                            .semantics { contentDescription = "$label${if (selected) ", selected" else ""}" },
                        color = if (selected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surface,
                        shape = MaterialTheme.shapes.medium,
                        tonalElevation = if (selected) 1.dp else 0.dp,
                    ) {
                        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Text(label, style = MaterialTheme.typography.titleMedium, modifier = Modifier.weight(1f))
                            Text("Aa", fontFamily = if (id == "inter") FontFamily.SansSerif else FontFamily.Serif, fontSize = 19.sp)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SettingSectionTitle(text: String) {
    Text(text, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
    Spacer(Modifier.height(8.dp))
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CaptureSheet(
    uiState: HuushUiState,
    onUrlChanged: (String) -> Unit,
    onFetch: () -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .imePadding()
                .navigationBarsPadding()
                .padding(horizontal = 22.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("Add an article", style = MaterialTheme.typography.headlineMedium)
            Text(
                "Only public pages are supported. Huush never bypasses authentication, subscriptions, or paywalls.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = uiState.captureUrl,
                onValueChange = onUrlChanged,
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                label = { Text("Public article URL") },
                placeholder = { Text("https://example.com/article") },
                isError = uiState.errorMessage != null,
                supportingText = uiState.errorMessage?.let { message -> { Text(message) } },
            )
            if (uiState.isFetching) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
            Button(
                onClick = onFetch,
                enabled = !uiState.isFetching,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (uiState.isFetching) "Reading page…" else "Fetch and read")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReaderScreen(
    modifier: Modifier = Modifier,
    article: Article?,
    onBack: () -> Unit,
    onSave: () -> Unit,
    onDelete: (Article) -> Unit,
) {
    val context = LocalContext.current
    if (article == null) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("Article unavailable") }
        return
    }
    Scaffold(
        modifier = modifier.fillMaxSize(),
        topBar = {
            TopAppBar(
                modifier = Modifier.statusBarsPadding(),
                title = {
                    Text(article.source, maxLines = 1, overflow = TextOverflow.Ellipsis)
                },
                navigationIcon = {
                    IconButton(onClick = onBack) { Icon(Icons.Default.ArrowBack, contentDescription = "Back") }
                },
                actions = {
                    IconButton(onClick = onSave) { Icon(Icons.Default.BookmarkBorder, contentDescription = "Save article") }
                    IconButton(onClick = { onDelete(article) }) { Icon(Icons.Default.DeleteOutline, contentDescription = "Delete article") }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.Transparent),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .padding(innerPadding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp)
                .padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            Text(article.title, style = MaterialTheme.typography.headlineLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(article.source, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.primary)
                Text("•", color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(if (article.previewOnly) "Preview only" else "Saved", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Divider()
            androidx.compose.foundation.text.selection.SelectionContainer {
                Text(
                    text = article.paragraphs.joinToString("\n\n").ifBlank { "No readable text was found on this public page." },
                    style = MaterialTheme.typography.bodyLarge.copy(
                        fontSize = MaterialTheme.typography.bodyLarge.fontSize,
                        lineHeight = (MaterialTheme.typography.bodyLarge.lineHeight.value * 1.05f).sp,
                        fontFamily = if (article.previewOnly) FontFamily.Serif else MaterialTheme.typography.bodyLarge.fontFamily,
                    ),
                )
            }
            if (article.previewOnly) {
                Text(
                    "This page was too short to store as a full article. Open the source in your browser for the complete content.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                OutlinedButton(onClick = {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(article.url)))
                }) { Text("Open the source in your browser") }
            }
        }
    }
}
