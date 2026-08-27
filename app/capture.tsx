import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { HuushScreen } from "@/components/huush-screen";
import { useHuush } from "@/lib/huush/store";
import { useHuushPalette } from "@/lib/huush/theme";
import { trpc } from "@/lib/trpc";

export default function CaptureScreen() {
  const router = useRouter();
  const { settings, saveArticle, openPreview } = useHuush();
  const palette = useHuushPalette(settings.theme);
  const [url, setUrl] = useState("");
  const extraction = trpc.huush.extract.useMutation();
  const working = extraction.isPending;
  const capture = async () => {
    const candidate = url.trim();
    try { new URL(candidate); } catch { Alert.alert("Add a full link", "Paste a complete https:// address for a public article."); return; }
    try {
      const result = await extraction.mutateAsync({ url: candidate });
      const article = result.previewOnly ? openPreview(result) : await saveArticle(result);
      router.replace({ pathname: "/reader/[id]", params: { id: article.id } });
    } catch (error) {
      Alert.alert("Could not prepare this article", error instanceof Error ? error.message : "Please try another public article link.");
    }
  };
  return (
    <HuushScreen edges={["top", "bottom", "left", "right"]}>
      <KeyboardAvoidingView style={[styles.shell, { backgroundColor: palette.canvas }]} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.top}><Pressable onPress={() => router.back()} accessibilityLabel="Close capture" style={({ pressed }) => [styles.close, { borderColor: palette.divider }, pressed && styles.pressed]}><MaterialCommunityIcons name="close" size={21} color={palette.ink} /></Pressable></View>
        <View style={styles.content}><Text style={[styles.title, { color: palette.ink, fontFamily: "serif" }]}>Save an article</Text><Text style={[styles.copy, { color: palette.muted }]}>Paste a public article link. Huush keeps the complete version only when it can verify enough readable content.</Text><TextInput value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} autoFocus keyboardType="url" placeholder="https://example.com/article" placeholderTextColor={palette.faint} style={[styles.input, { color: palette.ink, borderColor: palette.divider, backgroundColor: palette.surface }]} returnKeyType="go" onSubmitEditing={() => void capture()} /><Pressable disabled={working || !url.trim()} onPress={() => void capture()} style={({ pressed }) => [styles.action, { backgroundColor: palette.ink }, (working || !url.trim()) && styles.disabled, pressed && styles.pressed]}><Text style={[styles.actionText, { color: palette.canvas }]}>{working ? "Preparing reader…" : "Read this in Huush"}</Text><MaterialCommunityIcons name="arrow-right" size={20} color={palette.canvas} /></Pressable><Text style={[styles.note, { color: palette.faint }]}>Huush does not bypass subscriptions, logins, or publisher access controls.</Text></View>
      </KeyboardAvoidingView>
    </HuushScreen>
  );
}

const styles = StyleSheet.create({ shell: { flex: 1, paddingHorizontal: 20 }, top: { alignItems: "flex-end", paddingTop: 6 }, close: { alignItems: "center", borderRadius: 20, borderWidth: 1, height: 40, justifyContent: "center", width: 40 }, content: { flex: 1, justifyContent: "center", paddingBottom: 80 }, title: { fontSize: 36, fontWeight: "700", letterSpacing: -1 }, copy: { fontSize: 16, lineHeight: 24, marginTop: 12, maxWidth: 500 }, input: { borderRadius: 15, borderWidth: 1, fontSize: 16, marginTop: 28, minHeight: 57, paddingHorizontal: 15 }, action: { alignItems: "center", borderRadius: 16, flexDirection: "row", justifyContent: "center", gap: 9, marginTop: 12, minHeight: 54 }, actionText: { fontSize: 16, fontWeight: "800" }, note: { fontSize: 12, lineHeight: 18, marginTop: 16, textAlign: "center" }, disabled: { opacity: 0.42 }, pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] } });
