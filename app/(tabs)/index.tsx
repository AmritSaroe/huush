import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";

import { HuushScreen } from "@/components/huush-screen";
import type { Article } from "@/lib/huush/models";
import { useHuush } from "@/lib/huush/store";
import { useHuushPalette } from "@/lib/huush/theme";

function ArticleCard({ article, onPress }: { article: Article; onPress: () => void }) {
  const { settings } = useHuush();
  const palette = useHuushPalette(settings.theme);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${article.title}`}
      style={({ pressed }) => [styles.card, { backgroundColor: palette.surface, borderColor: palette.divider }, pressed && styles.pressed]}
    >
      <Text style={[styles.cardSource, { color: palette.accent }]} numberOfLines={1}>{article.source}</Text>
      <Text style={[styles.cardTitle, { color: palette.ink, fontFamily: settings.font === "serif" ? "serif" : undefined }]} numberOfLines={4}>{article.title}</Text>
      <Text style={[styles.cardExcerpt, { color: palette.muted }]} numberOfLines={3}>{article.excerpt || article.content[0]}</Text>
      <View style={styles.cardFoot}>
        <Text style={[styles.cardMeta, { color: palette.faint }]}>{article.previewOnly ? "Preview only" : "Saved for offline"}</Text>
        <MaterialCommunityIcons name="arrow-top-right" size={16} color={palette.faint} />
      </View>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const router = useRouter();
  const { articles, settings, hydrated } = useHuush();
  const palette = useHuushPalette(settings.theme);
  const { width } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const items = useMemo(
    () => articles.filter((article) => `${article.title} ${article.source}`.toLowerCase().includes(query.trim().toLowerCase())),
    [articles, query],
  );
  const columns = width >= 1440 ? 3 : width >= 980 ? 2 : 1;

  return (
    <HuushScreen edges={["top", "left", "right"]}>
      <View style={[styles.page, { backgroundColor: palette.canvas }]}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.wordmark, { color: palette.ink, fontFamily: "serif" }]}>Huush</Text>
            <Text style={[styles.kicker, { color: palette.muted }]}>a quiet place for reading</Text>
          </View>
          <View style={styles.headerRight}>
            {width >= 1024 && <View style={styles.desktopNav}><Pressable onPress={() => router.replace("/")} style={styles.desktopNavItem}><Text style={[styles.desktopNavText, { color: palette.accent }]}>Library</Text></Pressable><Pressable onPress={() => router.push("/tags")} style={styles.desktopNavItem}><Text style={[styles.desktopNavText, { color: palette.muted }]}>Tags</Text></Pressable><Pressable onPress={() => router.push("/settings")} style={styles.desktopNavItem}><Text style={[styles.desktopNavText, { color: palette.muted }]}>Settings</Text></Pressable></View>}
            <Pressable
              onPress={() => router.push("/capture")}
              accessibilityLabel="Add article"
              style={({ pressed }) => [styles.headerAdd, { backgroundColor: palette.ink }, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="plus" size={21} color={palette.canvas} />
              <Text style={[styles.headerAddText, { color: palette.canvas }]}>Add</Text>
            </Pressable>
          </View>
        </View>
        <View style={[styles.search, { backgroundColor: palette.surface, borderColor: palette.divider }]}>
          <MaterialCommunityIcons name="magnify" size={20} color={palette.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your library"
            placeholderTextColor={palette.faint}
            style={[styles.searchInput, { color: palette.ink }]}
            accessibilityLabel="Search saved articles"
          />
          {!!query && (
            <Pressable onPress={() => setQuery("")} accessibilityLabel="Clear library search">
              <MaterialCommunityIcons name="close-circle" size={18} color={palette.faint} />
            </Pressable>
          )}
        </View>
        {!hydrated ? (
          <View style={styles.center}><Text style={{ color: palette.muted }}>Opening your library…</Text></View>
        ) : (
          <FlatList
            key={columns}
            data={items}
            numColumns={columns}
            keyExtractor={(item) => item.id}
            columnWrapperStyle={columns > 1 ? styles.columns : undefined}
            contentContainerStyle={[styles.list, items.length === 0 && styles.emptyList]}
            renderItem={({ item }) => (
              <View style={columns > 1 ? styles.gridItem : undefined}>
                <ArticleCard article={item} onPress={() => router.push({ pathname: "/reader/[id]", params: { id: item.id } })} />
              </View>
            )}
            ListEmptyComponent={(
              <View style={styles.empty}>
                <View style={[styles.emptyMark, { backgroundColor: palette.accentSoft }]}>
                  <MaterialCommunityIcons name="book-open-page-variant-outline" size={34} color={palette.accent} />
                </View>
                <Text style={[styles.emptyTitle, { color: palette.ink, fontFamily: "serif" }]}>{query ? "Nothing found" : "Keep what matters."}</Text>
                <Text style={[styles.emptyCopy, { color: palette.muted }]}>{query ? "Try a different title or source." : "Save a public article, then return to it whenever you want—without the noise."}</Text>
                {!query && (
                  <Pressable onPress={() => router.push("/capture")} style={({ pressed }) => [styles.emptyAction, { backgroundColor: palette.ink }, pressed && styles.pressed]}>
                    <Text style={[styles.emptyActionText, { color: palette.canvas }]}>Add your first article</Text>
                  </Pressable>
                )}
              </View>
            )}
          />
        )}
        {Platform.OS !== "web" && (
          <Pressable onPress={() => router.push("/capture")} accessibilityLabel="Add article" style={({ pressed }) => [styles.fab, { backgroundColor: palette.accent }, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="plus" size={26} color="#1F2A0B" />
          </Pressable>
        )}
      </View>
    </HuushScreen>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: 20 },
  header: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", paddingBottom: 22, paddingTop: 8 },
  headerRight: { alignItems: "center", flexDirection: "row", gap: 18 },
  wordmark: { fontSize: 34, fontWeight: "700", letterSpacing: -1.1 },
  kicker: { fontSize: 13, letterSpacing: 0.15, marginTop: 1 },
  headerAdd: { alignItems: "center", borderRadius: 22, flexDirection: "row", gap: 4, minHeight: 44, paddingHorizontal: 15 },
  headerAddText: { fontSize: 14, fontWeight: "700" },
  desktopNav: { alignItems: "center", flexDirection: "row", gap: 4 },
  desktopNavItem: { borderRadius: 14, minHeight: 38, paddingHorizontal: 11, justifyContent: "center" },
  desktopNavText: { fontSize: 14, fontWeight: "700" },
  search: { alignItems: "center", borderRadius: 14, borderWidth: 1, flexDirection: "row", gap: 9, minHeight: 50, paddingHorizontal: 14 },
  searchInput: { flex: 1, fontSize: 16, minHeight: 46 },
  list: { gap: 12, paddingBottom: 112, paddingTop: 18 },
  columns: { gap: 12 },
  gridItem: { flex: 1 },
  card: { borderRadius: 18, borderWidth: 1, minHeight: 184, padding: 18 },
  cardSource: { fontSize: 13, fontWeight: "700", letterSpacing: 0.2, marginBottom: 9 },
  cardTitle: { fontSize: 22, fontWeight: "700", letterSpacing: -0.3, lineHeight: 27 },
  cardExcerpt: { fontSize: 14, lineHeight: 20, marginTop: 10 },
  cardFoot: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: "auto", paddingTop: 14 },
  cardMeta: { fontSize: 12, fontWeight: "600" },
  emptyList: { flexGrow: 1 },
  empty: { alignItems: "center", alignSelf: "center", maxWidth: 340, paddingBottom: 70, paddingTop: 72 },
  emptyMark: { alignItems: "center", borderRadius: 28, height: 58, justifyContent: "center", width: 58 },
  emptyTitle: { fontSize: 30, fontWeight: "700", letterSpacing: -0.7, marginTop: 20, textAlign: "center" },
  emptyCopy: { fontSize: 15, lineHeight: 22, marginTop: 10, textAlign: "center" },
  emptyAction: { borderRadius: 24, justifyContent: "center", marginTop: 24, minHeight: 48, paddingHorizontal: 19 },
  emptyActionText: { fontSize: 14, fontWeight: "700" },
  center: { alignItems: "center", flex: 1, justifyContent: "center" },
  fab: { alignItems: "center", borderRadius: 28, bottom: 22, elevation: 3, height: 56, justifyContent: "center", position: "absolute", right: 22, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 10, width: 56 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
});
