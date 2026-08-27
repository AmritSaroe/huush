import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { HuushScreen } from "@/components/huush-screen";
import { useHuush } from "@/lib/huush/store";
import { useHuushPalette } from "@/lib/huush/theme";

export default function ReaderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { getArticle, removeArticle, collections, assignArticleCollections, settings } = useHuush();
  const palette = useHuushPalette(settings.theme);
  const article = params.id ? getArticle(params.id) : undefined;
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const bodyFont = settings.font === "serif" ? "serif" : undefined;
  if (!article) return <HuushScreen><View style={[styles.missing, { backgroundColor: palette.canvas }]}><Text style={{ color: palette.muted }}>This article is no longer in your library.</Text><Pressable onPress={() => router.replace("/")}><Text style={{ color: palette.accent, fontWeight: "700", marginTop: 12 }}>Return to Library</Text></Pressable></View></HuushScreen>;
  const openSource = async () => { try { await Linking.openURL(article.url); } catch { /* The button remains harmless when no browser is available. */ } };
  const remove = async () => { await removeArticle(article.id); router.replace("/"); };
  const toggleCollection = (collectionId: string) => {
    const next = article.collectionIds.includes(collectionId)
      ? article.collectionIds.filter((id) => id !== collectionId)
      : [...article.collectionIds, collectionId];
    void assignArticleCollections(article.id, next);
  };
  return (
    <HuushScreen edges={["top", "left", "right"]}>
      <View style={[styles.shell, { backgroundColor: palette.canvas }]}>
        <View style={styles.toolbar}><Pressable onPress={() => router.back()} accessibilityLabel="Back to library" style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><MaterialCommunityIcons name="arrow-left" size={29} color={palette.ink} /></Pressable><View style={styles.toolbarActions}>{!article.previewOnly && <Pressable onPress={() => setCollectionsOpen(true)} accessibilityLabel="Choose collections" style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><MaterialCommunityIcons name="tag-outline" size={23} color={palette.ink} /></Pressable>}<Pressable onPress={openSource} accessibilityLabel="Open source in browser" style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><MaterialCommunityIcons name="open-in-new" size={23} color={palette.ink} /></Pressable>{!article.previewOnly && <Pressable onPress={() => void remove()} accessibilityLabel="Remove article" style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><MaterialCommunityIcons name="trash-can-outline" size={23} color={palette.ink} /></Pressable>}</View></View>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={[styles.source, { color: palette.accent }]}>{article.source}</Text>
          <Text selectable style={[styles.title, { color: palette.ink, fontFamily: bodyFont }]}>{article.title}</Text>
          <View style={styles.meta}><Text style={[styles.metaText, { color: palette.muted }]}>{article.byline || article.source}</Text><Text style={[styles.dot, { color: palette.faint }]}>•</Text><Text style={[styles.metaText, { color: palette.muted }]}>{article.previewOnly ? "Preview only" : "Saved for offline"}</Text></View>
          <View style={[styles.rule, { backgroundColor: palette.divider }]} />
          {article.content.map((paragraph, index) => <Text selectable key={`${article.id}-${index}`} style={[styles.paragraph, { color: palette.ink, fontFamily: bodyFont, fontSize: settings.fontSize, lineHeight: Math.round(settings.fontSize * 1.63) }]}>{paragraph}</Text>)}
          {article.previewOnly && <View style={[styles.preview, { backgroundColor: palette.surface, borderColor: palette.divider }]}><MaterialCommunityIcons name="information-outline" size={20} color={palette.accent} /><View style={{ flex: 1 }}><Text style={[styles.previewTitle, { color: palette.ink, fontFamily: bodyFont }]}>Preview only</Text><Text style={[styles.previewCopy, { color: palette.muted }]}>This page was too short or incomplete to store as a full article. Open the publisher’s source for the complete page.</Text></View><Pressable onPress={openSource} style={({ pressed }) => [styles.sourceButton, { borderColor: palette.divider }, pressed && styles.pressed]}><Text style={[styles.sourceButtonText, { color: palette.ink }]}>Open source</Text></Pressable></View>}
        </ScrollView>
        <Modal visible={collectionsOpen} transparent animationType="fade" onRequestClose={() => setCollectionsOpen(false)}>
          <Pressable onPress={() => setCollectionsOpen(false)} style={styles.modalBackdrop}>
            <Pressable onPress={(event) => event.stopPropagation()} style={[styles.collectionSheet, { backgroundColor: palette.surfaceRaised, borderColor: palette.divider }]}>
              <Text style={[styles.sheetTitle, { color: palette.ink, fontFamily: bodyFont }]}>Add to collection</Text>
              {collections.length === 0 ? <Text style={[styles.sheetCopy, { color: palette.muted }]}>Create a collection in Tags first, then return here to place this article.</Text> : collections.map((collection) => {
                const selected = article.collectionIds.includes(collection.id);
                return <Pressable key={collection.id} onPress={() => toggleCollection(collection.id)} style={({ pressed }) => [styles.collectionRow, { borderColor: palette.divider }, pressed && styles.pressed]}><Text style={[styles.collectionName, { color: palette.ink }]}>{collection.name}</Text><MaterialCommunityIcons name={selected ? "check-circle" : "circle-outline"} size={22} color={selected ? palette.accent : palette.faint} /></Pressable>;
              })}
              <Pressable onPress={() => setCollectionsOpen(false)} style={({ pressed }) => [styles.doneButton, { backgroundColor: palette.ink }, pressed && styles.pressed]}><Text style={[styles.doneButtonText, { color: palette.canvas }]}>Done</Text></Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </HuushScreen>
  );
}

const styles = StyleSheet.create({ shell: { flex: 1, paddingHorizontal: 20 }, toolbar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", paddingBottom: 12, paddingTop: 4 }, toolbarActions: { flexDirection: "row", gap: 3 }, iconButton: { alignItems: "center", borderRadius: 22, height: 44, justifyContent: "center", width: 44 }, content: { alignSelf: "center", maxWidth: 700, paddingBottom: 54, paddingTop: 17, width: "100%" }, source: { fontSize: 14, fontWeight: "800", letterSpacing: 0.25, marginBottom: 13 }, title: { fontSize: 39, fontWeight: "700", letterSpacing: -0.9, lineHeight: 46 }, meta: { flexDirection: "row", gap: 9, marginTop: 22 }, metaText: { fontSize: 14 }, dot: { fontSize: 14 }, rule: { height: 1, marginVertical: 27 }, paragraph: { letterSpacing: 0.05, marginBottom: 20 }, preview: { borderRadius: 18, borderWidth: 1, gap: 12, marginTop: 12, padding: 16 }, previewTitle: { fontSize: 19, fontWeight: "700" }, previewCopy: { fontSize: 14, lineHeight: 20, marginTop: 5 }, sourceButton: { alignSelf: "flex-start", borderRadius: 12, borderWidth: 1, marginTop: 14, minHeight: 38, paddingHorizontal: 13, justifyContent: "center" }, sourceButtonText: { fontSize: 13, fontWeight: "800" }, missing: { alignItems: "center", flex: 1, justifyContent: "center" }, modalBackdrop: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.42)", flex: 1, justifyContent: "center", padding: 20 }, collectionSheet: { borderRadius: 22, borderWidth: 1, maxWidth: 430, padding: 20, width: "100%" }, sheetTitle: { fontSize: 25, fontWeight: "700" }, sheetCopy: { fontSize: 14, lineHeight: 20, marginTop: 10 }, collectionRow: { alignItems: "center", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 53 }, collectionName: { fontSize: 16, fontWeight: "700" }, doneButton: { alignItems: "center", borderRadius: 14, justifyContent: "center", marginTop: 18, minHeight: 48 }, doneButtonText: { fontSize: 15, fontWeight: "800" }, pressed: { opacity: 0.72, transform: [{ scale: 0.96 }] } });
