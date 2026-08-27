package com.amritsaroe.huush.compose.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

object HuushPalette {
    val Paper = Color(0xFFF6F1E8)
    val Ink = Color(0xFF171716)
    val Sepia = Color(0xFFEEE2CB)
    val SepiaInk = Color(0xFF3E2723)
    val Lime = Color(0xFFB8D96B)
    val LimeDeep = Color(0xFF738F31)
    val MutedLight = Color(0xFF6F6A61)
    val MutedDark = Color(0xFFB8B4AA)
    val LineLight = Color(0xFFD9D1C4)
    val LineDark = Color(0xFF3A3A37)
}

enum class ReaderTheme(val label: String) {
    Light("Light"),
    Dark("Dark"),
    Sepia("Sepia"),
}

private val LightScheme = lightColorScheme(
    primary = HuushPalette.LimeDeep,
    onPrimary = HuushPalette.Ink,
    primaryContainer = HuushPalette.Lime,
    onPrimaryContainer = HuushPalette.Ink,
    background = HuushPalette.Paper,
    onBackground = HuushPalette.Ink,
    surface = HuushPalette.Paper,
    onSurface = HuushPalette.Ink,
    surfaceVariant = Color(0xFFECE5DA),
    onSurfaceVariant = HuushPalette.MutedLight,
    outline = HuushPalette.LineLight,
)

private val DarkScheme = darkColorScheme(
    primary = HuushPalette.Lime,
    onPrimary = HuushPalette.Ink,
    primaryContainer = Color(0xFF35451D),
    onPrimaryContainer = Color(0xFFE3F5B3),
    background = HuushPalette.Ink,
    onBackground = HuushPalette.Paper,
    surface = HuushPalette.Ink,
    onSurface = HuushPalette.Paper,
    surfaceVariant = Color(0xFF262624),
    onSurfaceVariant = HuushPalette.MutedDark,
    outline = HuushPalette.LineDark,
)

private val SepiaScheme = lightColorScheme(
    primary = HuushPalette.SepiaInk,
    onPrimary = HuushPalette.Sepia,
    primaryContainer = Color(0xFFD3B986),
    onPrimaryContainer = HuushPalette.SepiaInk,
    background = HuushPalette.Sepia,
    onBackground = HuushPalette.SepiaInk,
    surface = HuushPalette.Sepia,
    onSurface = HuushPalette.SepiaInk,
    surfaceVariant = Color(0xFFE4D3B2),
    onSurfaceVariant = Color(0xFF725B47),
    outline = Color(0xFFC9B48D),
)

private val HuushTypography = Typography(
    displaySmall = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 36.sp, lineHeight = 42.sp),
    headlineLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 30.sp, lineHeight = 36.sp),
    headlineMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 25.sp, lineHeight = 31.sp),
    titleLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 21.sp, lineHeight = 27.sp),
    titleMedium = TextStyle(fontWeight = FontWeight.Medium, fontSize = 16.sp, lineHeight = 23.sp),
    bodyLarge = TextStyle(fontFamily = FontFamily.Serif, fontSize = 18.sp, lineHeight = 30.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.sp, lineHeight = 17.sp),
    labelLarge = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 14.sp, lineHeight = 20.sp),
    labelMedium = TextStyle(fontWeight = FontWeight.Medium, fontSize = 12.sp, lineHeight = 16.sp),
)

@Composable
fun HuushTheme(
    theme: ReaderTheme,
    content: @Composable () -> Unit,
) {
    val colorScheme = when (theme) {
        ReaderTheme.Light -> LightScheme
        ReaderTheme.Dark -> DarkScheme
        ReaderTheme.Sepia -> SepiaScheme
    }
    MaterialTheme(
        colorScheme = colorScheme,
        typography = HuushTypography,
        shapes = Shapes(
            small = androidx.compose.foundation.shape.RoundedCornerShape(10.dp),
            medium = androidx.compose.foundation.shape.RoundedCornerShape(16.dp),
            large = androidx.compose.foundation.shape.RoundedCornerShape(22.dp),
        ),
        content = content,
    )
}

fun systemReaderTheme(isDark: Boolean): ReaderTheme =
    if (isDark) ReaderTheme.Dark else ReaderTheme.Light
