import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { HuushScreen } from "@/components/huush-screen";
import { useHuush } from "@/lib/huush/store";
import { useHuushPalette } from "@/lib/huush/theme";

export default function TagsScreen() {
  const { collections, articles, settings, createCollection } = useHuush();
  const palette = useHuushPalette(settings.theme);
  const [name, setName] = useState("");
  const submit = async () => {
    if (!name.trim()) return;
    await createCollection(name);
    setName("");
  };
  return (
    <HuushScreen edges={["top", "left", "right"]}>
      <View style={[styles.page, { backgroundColor: palette.canvas }]}>
        <Text style={[styles.title, { color: palette.ink, fontFamily: "serif" }]}>Tags & collections</Text>
        <Text style={[styles.copy, { color: palette.muted }]}>Give recurring ideas a home. Articles can belong to more than one collection.</Text>
        <View style={[styles.composer, { backgroundColor: palette.surface, borderColor: palette.divider }]}><TextInput value={name} onChangeText={setName} onSubmitEditing={submit} placeholder="New collection" placeholderTextColor={palette.faint} style={[styles.input, { color: palette.ink }]} returnKeyType="done" /><Pressable onPress={submit} accessibilityLabel="Create collection" style={[styles.add, { backgroundColor: palette.accent }]}><MaterialCommunityIcons name="plus" size={20} color="#273412" /></Pressable></View>
        <View style={styles.list}>{collections.length === 0 ? <View style={styles.empty}><MaterialCommunityIcons name="tag-outline" size={34} color={palette.faint} /><Text style={[styles.emptyTitle, { color: palette.ink, fontFamily: "serif" }]}>Start a small shelf.</Text><Text style={[styles.emptyCopy, { color: palette.muted }]}>Create a collection for topics you want to revisit.</Text></View> : collections.map((collection) => { const total = articles.filter((article) => article.collectionIds.includes(collection.id)).length; return <Pressable key={collection.id} onPress={() => Alert.alert(collection.name, `${total} saved ${total === 1 ? "article" : "articles"}. Assignment controls are the next library milestone.`)} style={({ pressed }) => [styles.row, { backgroundColor: palette.surface, borderColor: palette.divider }, pressed && styles.pressed]}><View style={[styles.tagIcon, { backgroundColor: palette.accentSoft }]}><MaterialCommunityIcons name="tag-outline" size={19} color={palette.accent} /></View><Text style={[styles.rowName, { color: palette.ink }]}>{collection.name}</Text><Text style={[styles.rowCount, { color: palette.muted }]}>{total}</Text><MaterialCommunityIcons name="chevron-right" size={20} color={palette.faint} /></Pressable>; })}</View>
      </View>
    </HuushScreen>
  );
}

const styles = StyleSheet.create({ page: { flex: 1, paddingHorizontal: 20, paddingTop: 10 }, title: { fontSize: 32, fontWeight: "700", letterSpacing: -0.8 }, copy: { fontSize: 15, lineHeight: 22, marginTop: 8, maxWidth: 440 }, composer: { alignItems: "center", borderRadius: 15, borderWidth: 1, flexDirection: "row", marginTop: 26, minHeight: 52, paddingLeft: 14 }, input: { flex: 1, fontSize: 16, minHeight: 50 }, add: { alignItems: "center", borderRadius: 11, height: 38, justifyContent: "center", marginRight: 6, width: 42 }, list: { marginTop: 16 }, row: { alignItems: "center", borderRadius: 16, borderWidth: 1, flexDirection: "row", gap: 12, marginBottom: 10, minHeight: 62, paddingHorizontal: 12 }, tagIcon: { alignItems: "center", borderRadius: 12, height: 38, justifyContent: "center", width: 38 }, rowName: { flex: 1, fontSize: 16, fontWeight: "700" }, rowCount: { fontSize: 13, fontWeight: "600" }, empty: { alignItems: "center", paddingTop: 88 }, emptyTitle: { fontSize: 26, fontWeight: "700", marginTop: 16 }, emptyCopy: { fontSize: 15, marginTop: 7, textAlign: "center" }, pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] } });
